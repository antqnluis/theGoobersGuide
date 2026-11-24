import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CampNpcs, type NpcScreen } from './CampNpcs'
import { summarizeNpc } from './npcRules'
import { getNpc, listNpcs } from './npcService'
import { campaignId, npc, roster, userId } from './npcTestData'

vi.mock('./npcService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./npcService')>()),
  listNpcs: vi.fn(),
  getNpc: vi.fn(),
}))

afterEach(cleanup)
beforeEach(() => vi.resetAllMocks())

function makeActions(overrides: Record<string, unknown> = {}) {
  return {
    error: null as string | null,
    clearError: vi.fn(),
    pendingAction: null as string | null,
    pendingNpcId: null as string | null,
    create: vi.fn(),
    save: vi.fn(),
    changeVisibility: vi.fn(),
    setPortrait: vi.fn(),
    clearPortrait: vi.fn(),
    remove: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
}

function Harness({
  actions,
  initial = { type: 'list' },
}: {
  actions: ReturnType<typeof makeActions>
  initial?: NpcScreen
}) {
  const [screen, setScreen] = useState<NpcScreen>(initial)
  const [filter, setFilter] = useState('')
  return (
    <CampNpcs
      actions={actions as never}
      campaignId={campaignId}
      enabled
      filter={filter}
      onFilterChange={setFilter}
      onNotice={vi.fn()}
      onScreenChange={setScreen}
      roster={roster}
      screen={screen}
      tabs={<p>tabs</p>}
      userId={userId}
    />
  )
}

function setup(actions = makeActions(), initial?: NpcScreen) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <Harness actions={actions} initial={initial} />
    </QueryClientProvider>,
  )
  return { actions, user: userEvent.setup() }
}

describe('CampNpcs', () => {
  it('shows an empty state with the tabs and a way to add the first NPC', async () => {
    vi.mocked(listNpcs).mockResolvedValue([])
    setup()
    expect(await screen.findByText(/No NPCs yet/)).toBeTruthy()
    expect(screen.getByText('tabs')).toBeTruthy()
    expect(screen.getByRole('button', { name: /New NPC/ })).toBeTruthy()
  })

  it('keeps one stable page title for both tabs, so the dialog keeps its name', async () => {
    vi.mocked(listNpcs).mockResolvedValue([])
    setup()
    const heading = await screen.findByRole('heading', { level: 2 })
    expect(heading.id).toBe('camp-notes-heading')
    expect(heading.textContent).toBe('Notes & NPCs')
  })

  it('shows each NPC as one tile with its role, place, and who can see it', async () => {
    vi.mocked(listNpcs).mockResolvedValue(
      [npc({ name: 'Orin Vale', role: 'Smith', location: 'Harbor', visibility: 'campaign' })].map(
        summarizeNpc,
      ),
    )
    setup()
    const open = await screen.findByRole('button', { name: 'Orin Vale' })
    const tile = open.closest('li')!
    expect(tile.textContent).toContain('Smith · Harbor')
    expect(tile.textContent).toContain('Shared')
  })

  it('puts the filter before the New NPC button, so lookup comes first', async () => {
    vi.mocked(listNpcs).mockResolvedValue([summarizeNpc(npc())])
    setup()
    const filter = await screen.findByLabelText(/Filter by name/)
    const add = screen.getByRole('button', { name: /New NPC/ })
    expect(filter.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('offers a picture once the NPC is created, with the picture button focused', async () => {
    const created = npc({ name: 'Mira the Wanderer' })
    vi.mocked(listNpcs).mockResolvedValue([])
    vi.mocked(getNpc).mockResolvedValue(created)
    const actions = makeActions({ create: vi.fn().mockResolvedValue({ ok: true, npc: created }) })
    const { user } = setup(actions, { type: 'new' })
    expect(screen.getByText(/add a picture once the NPC is created/i)).toBeTruthy()
    await user.type(screen.getByLabelText('Name'), 'Mira the Wanderer')
    await user.click(screen.getByRole('button', { name: 'Create NPC' }))
    const add = await screen.findByRole('button', { name: 'Add a picture' })
    await waitFor(() => expect(document.activeElement).toBe(add))
  })

  it('groups shared NPCs apart from private ones', async () => {
    const shared = npc({ name: 'Orin Vale', visibility: 'campaign' })
    const mine = npc({ name: 'Brenna Ashdown', visibility: 'private' })
    vi.mocked(listNpcs).mockResolvedValue([shared, mine].map(summarizeNpc))
    setup()
    expect(await screen.findByRole('button', { name: 'Orin Vale' })).toBeTruthy()
    const sharedGroup = screen.getByRole('region', { name: /Shared with the campaign/ })
    const privateGroup = screen.getByRole('region', { name: /Only you/ })
    expect(sharedGroup.textContent).toContain('Orin Vale')
    expect(privateGroup.textContent).toContain('Brenna Ashdown')
  })

  it('filters by name, role, or place', async () => {
    vi.mocked(listNpcs).mockResolvedValue(
      [
        npc({ name: 'Brenna', role: 'Innkeeper' }),
        npc({ name: 'Orin', role: 'Smith', location: 'Harbor' }),
      ].map(summarizeNpc),
    )
    const { user } = setup()
    await screen.findByRole('button', { name: 'Brenna' })
    await user.type(screen.getByLabelText(/Filter by name/), 'harbor')
    expect(screen.queryByRole('button', { name: 'Brenna' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Orin' })).toBeTruthy()
  })

  it('validates the name before creating', async () => {
    vi.mocked(listNpcs).mockResolvedValue([])
    const { actions, user } = setup(makeActions(), { type: 'new' })
    await user.click(screen.getByRole('button', { name: 'Create NPC' }))
    expect(screen.getByText(/Enter a name/)).toBeTruthy()
    expect(actions.create).not.toHaveBeenCalled()
  })

  it('creates an NPC from the form', async () => {
    const created = npc({ name: 'Mira the Wanderer', visibility: 'campaign' })
    vi.mocked(listNpcs).mockResolvedValue([])
    vi.mocked(getNpc).mockResolvedValue(created)
    const actions = makeActions({ create: vi.fn().mockResolvedValue({ ok: true, npc: created }) })
    const { user } = setup(actions, { type: 'new' })
    await user.type(screen.getByLabelText('Name'), '  Mira the Wanderer ')
    await user.click(screen.getByLabelText('Shared with the campaign'))
    await user.click(screen.getByRole('button', { name: 'Create NPC' }))
    await waitFor(() =>
      expect(actions.create).toHaveBeenCalledWith({
        name: 'Mira the Wanderer',
        role: '',
        location: '',
        body: '',
        visibility: 'campaign',
      }),
    )
    expect(await screen.findByRole('heading', { name: 'Mira the Wanderer' })).toBeTruthy()
  })

  it('lets only the author share or delete, while anyone may edit', async () => {
    const theirs = npc({
      author_id: '00000000-0000-4000-8000-000000000002',
      visibility: 'campaign',
    })
    vi.mocked(listNpcs).mockResolvedValue([summarizeNpc(theirs)])
    vi.mocked(getNpc).mockResolvedValue(theirs)
    setup(makeActions(), { type: 'npc', id: theirs.id })
    expect(await screen.findByRole('button', { name: 'Edit NPC' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Delete NPC' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Make private' })).toBeNull()
  })

  it('offers the picture upload to the author only', async () => {
    const mine = npc()
    const theirs = npc({
      author_id: '00000000-0000-4000-8000-000000000002',
      visibility: 'campaign',
    })
    vi.mocked(listNpcs).mockResolvedValue([mine, theirs].map(summarizeNpc))
    vi.mocked(getNpc).mockImplementation(async (id) => (id === mine.id ? mine : theirs))
    const first = setup(makeActions(), { type: 'npc', id: mine.id })
    expect(await screen.findByRole('button', { name: 'Add a picture' })).toBeTruthy()
    cleanup()
    setup(makeActions(), { type: 'npc', id: theirs.id })
    expect(await screen.findByRole('button', { name: 'Edit NPC' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /picture/i })).toBeNull()
    expect(first.actions.setPortrait).not.toHaveBeenCalled()
  })

  it('uploads a chosen picture and rejects an unsupported one', async () => {
    const mine = npc()
    vi.mocked(listNpcs).mockResolvedValue([summarizeNpc(mine)])
    vi.mocked(getNpc).mockResolvedValue(mine)
    const actions = makeActions({
      setPortrait: vi.fn().mockResolvedValue({ ok: true, npc: mine }),
    })
    const { user } = setup(actions, { type: 'npc', id: mine.id })
    await screen.findByRole('button', { name: 'Add a picture' })
    const input = screen.getByLabelText('NPC picture file')
    await user.upload(input, new File(['x'], 'face.png', { type: 'image/png' }))
    await waitFor(() =>
      expect(actions.setPortrait).toHaveBeenCalledWith(mine.id, expect.any(File), null),
    )
    await user.upload(input, new File(['x'], 'face.gif', { type: 'image/gif' }))
    expect(actions.setPortrait).toHaveBeenCalledTimes(1)
  })

  it('confirms before deleting your own NPC', async () => {
    const mine = npc()
    vi.mocked(listNpcs).mockResolvedValue([summarizeNpc(mine)])
    vi.mocked(getNpc).mockResolvedValue(mine)
    const { actions, user } = setup(makeActions(), { type: 'npc', id: mine.id })
    await user.click(await screen.findByRole('button', { name: 'Delete NPC' }))
    expect(actions.remove).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Yes, delete NPC' }))
    expect(actions.remove).toHaveBeenCalledWith(mine.id, null)
  })
})
