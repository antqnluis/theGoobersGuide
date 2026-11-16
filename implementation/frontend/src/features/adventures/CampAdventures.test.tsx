import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { character } from '../characters/characterTestData'
import { CampAdventures, type AdventureScreen } from './CampAdventures'
import { summarizeAdventure } from './adventureRules'
import { getAdventure, listAdventures, listInvitations } from './adventureService'
import {
  adventure,
  campaignId,
  characterId,
  invitation,
  miraCharacterId,
  miraId,
  objective,
  participant,
  roster,
  userId,
} from './adventureTestData'
import type { AdventureDetail } from './adventureTypes'

vi.mock('./adventureService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./adventureService')>()),
  listAdventures: vi.fn(),
  getAdventure: vi.fn(),
  listInvitations: vi.fn(),
}))

afterEach(cleanup)
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(listInvitations).mockResolvedValue([])
})

const ok = { ok: true as const, value: undefined }

function makeActions(overrides: Record<string, unknown> = {}) {
  return {
    error: null as string | null,
    clearError: vi.fn(),
    pendingAction: null as string | null,
    pendingId: null as string | null,
    create: vi.fn(),
    save: vi.fn(),
    changeStatus: vi.fn().mockResolvedValue(ok),
    archive: vi.fn().mockResolvedValue(ok),
    restore: vi.fn().mockResolvedValue(ok),
    addObjective: vi.fn().mockResolvedValue(ok),
    editObjective: vi.fn().mockResolvedValue(ok),
    toggleObjective: vi.fn().mockResolvedValue(ok),
    removeObjective: vi.fn().mockResolvedValue(ok),
    postUpdate: vi.fn().mockResolvedValue(ok),
    removeUpdate: vi.fn().mockResolvedValue(ok),
    propose: vi.fn().mockResolvedValue({ ok: true, value: 'p1' }),
    approve: vi.fn().mockResolvedValue(ok),
    cancel: vi.fn().mockResolvedValue(ok),
    respond: vi.fn().mockResolvedValue(ok),
    leave: vi.fn().mockResolvedValue(ok),
    ...overrides,
  }
}

function Harness({
  actions,
  initial = { type: 'list' },
  onDirtyChange,
  onNotice,
}: {
  actions: ReturnType<typeof makeActions>
  initial?: AdventureScreen
  onDirtyChange?: (dirty: boolean) => void
  onNotice: (notice: string) => void
}) {
  const [screen, setScreen] = useState<AdventureScreen>(initial)
  return (
    <CampAdventures
      actions={actions as never}
      campaignId={campaignId}
      characters={[
        character({ id: characterId, name: 'Brindle', owner_id: userId, status: 'active' }),
      ]}
      enabled
      onDirtyChange={onDirtyChange}
      onNotice={onNotice}
      onScreenChange={setScreen}
      roster={roster}
      screen={screen}
      userId={userId}
    />
  )
}

function setup(
  props: {
    actions?: ReturnType<typeof makeActions>
    initial?: AdventureScreen
    onDirtyChange?: (d: boolean) => void
  } = {},
) {
  const actions = props.actions ?? makeActions()
  const onNotice = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } })
  render(
    <QueryClientProvider client={client}>
      <Harness actions={actions} onNotice={onNotice} {...props} />
    </QueryClientProvider>,
  )
  return { actions, onNotice, user: userEvent.setup() }
}

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

const heir = adventure({
  id: 'heir',
  title: 'Find the heir',
  status: 'in_progress',
  updated_at: minutesAgo(10),
  objectives: [objective({ done: true }), objective()],
})
const hold = adventure({
  id: 'hold',
  title: 'Settle a debt',
  status: 'on_hold',
  type: 'side',
  updated_at: minutesAgo(5),
})
const story = adventure({
  id: 'story',
  title: 'The long road',
  type: 'main',
  visibility: 'campaign',
  participants: [],
  created_by: miraId,
  updated_at: minutesAgo(60),
})
const done = adventure({
  id: 'done',
  title: 'Bury the past',
  status: 'completed',
  updated_at: minutesAgo(90),
})
const shelved = adventure({
  id: 'shelved',
  title: 'Old grudge',
  archived_at: minutesAgo(200),
  updated_at: minutesAgo(200),
})

const all = [heir, hold, story, done, shelved]

describe('the adventures list', () => {
  it('shows a loading state, then the groups in the planned order', async () => {
    vi.mocked(listAdventures).mockResolvedValue(all.map((item) => summarizeAdventure(item)))
    setup()
    expect(screen.getByRole('status')).toHaveTextContent('Loading the adventures…')

    const main = await screen.findByRole('region', { name: 'Main story' })
    expect(within(main).getByRole('button', { name: 'The long road' })).toBeVisible()

    const yours = screen.getByRole('region', { name: 'Your adventures' })
    expect(
      within(yours)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Find the heir', 'Settle a debt'])
    expect(
      within(screen.getByRole('region', { name: 'Completed' })).getByRole('button', {
        name: 'Bury the past',
      }),
    ).toBeVisible()
    expect(screen.getByText('Archived (1)')).toBeVisible()
  })

  it('shows each row’s type, status, character, progress, and next step', async () => {
    vi.mocked(listAdventures).mockResolvedValue([summarizeAdventure(heir)])
    setup()
    const row = (await screen.findByRole('button', { name: 'Find the heir' })).closest('li')!
    expect(row).toHaveTextContent('Personal')
    expect(row).toHaveTextContent('In progress')
    expect(row).toHaveTextContent('Brindle')
    expect(row).toHaveTextContent('1 of 2 objectives')
    expect(row).toHaveTextContent('Next: Ask the innkeeper')
  })

  it('filters by title and says when nothing matches', async () => {
    vi.mocked(listAdventures).mockResolvedValue(all.map((item) => summarizeAdventure(item)))
    const { user } = setup()
    await screen.findByRole('region', { name: 'Main story' })
    await user.type(screen.getByLabelText('Filter by title'), 'heir')
    expect(screen.queryByRole('button', { name: 'The long road' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Find the heir' })).toBeVisible()

    await user.clear(screen.getByLabelText('Filter by title'))
    await user.type(screen.getByLabelText('Filter by title'), 'zzz')
    expect(screen.getByRole('status')).toHaveTextContent('No adventures match “zzz”.')
  })

  it('invites the first adventure when there are none', async () => {
    vi.mocked(listAdventures).mockResolvedValue([])
    setup()
    expect(await screen.findByText('No adventures yet. Start one.')).toBeVisible()
    expect(screen.queryByLabelText('Filter by title')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New adventure' })).toBeVisible()
  })

  it('offers a retry when the list cannot be loaded', async () => {
    vi.mocked(listAdventures).mockRejectedValueOnce(new Error('network down'))
    vi.mocked(listAdventures).mockResolvedValue([])
    const { user } = setup()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The adventures could not be loaded.',
    )
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('No adventures yet. Start one.')).toBeVisible()
  })

  it('shows the actions’ failure copy above the list', async () => {
    vi.mocked(listAdventures).mockResolvedValue([])
    setup({ actions: makeActions({ error: 'This adventure is no longer available.' }) })
    expect(await screen.findByRole('alert')).toHaveTextContent('no longer available')
  })
})

describe('creating', () => {
  it('creates an adventure, says so, and opens it', async () => {
    vi.mocked(listAdventures).mockResolvedValue([])
    const created: AdventureDetail = adventure({ id: 'new', title: 'Brand new' })
    vi.mocked(getAdventure).mockResolvedValue(created)
    const actions = makeActions({ create: vi.fn().mockResolvedValue({ ok: true, value: created }) })
    const { onNotice, user } = setup({ actions })
    await user.click(await screen.findByRole('button', { name: 'New adventure' }))
    expect(screen.getByRole('heading', { name: 'New adventure' })).toBeVisible()
    // The active character is chosen already.
    expect(screen.getByLabelText('For which character')).toHaveValue(characterId)

    await user.type(screen.getByLabelText('Title'), 'Brand new')
    await user.click(screen.getByRole('button', { name: 'Create adventure' }))
    expect(actions.create).toHaveBeenCalledWith({
      type: 'personal',
      title: 'Brand new',
      character_id: characterId,
      next_step: '',
    })
    expect(onNotice).toHaveBeenCalledWith('Adventure created.')
    expect(await screen.findByRole('heading', { level: 3, name: 'Brand new' })).toBeVisible()
  })

  it('asks before leaving a form with unsaved text, and can keep it', async () => {
    vi.mocked(listAdventures).mockResolvedValue([])
    const onDirtyChange = vi.fn()
    const { user } = setup({ onDirtyChange })
    await user.click(await screen.findByRole('button', { name: 'New adventure' }))
    await user.type(screen.getByLabelText('Title'), 'Half written')
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true))

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText(/You have edits that haven't been saved/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.getByLabelText('Title')).toHaveValue('Half written')

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Discard and go back' }))
    expect(await screen.findByRole('button', { name: 'New adventure' })).toHaveFocus()
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
  })

  it('warns before the tab closes while a form has unsaved text', async () => {
    vi.mocked(listAdventures).mockResolvedValue([])
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: 'New adventure' }))
    await user.type(screen.getByLabelText('Title'), 'x')
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })
})

describe('an open adventure', () => {
  it('loads the adventure, moves focus to its title, and goes back to its row', async () => {
    vi.mocked(listAdventures).mockResolvedValue([summarizeAdventure(heir)])
    let finish: (value: AdventureDetail) => void = () => {}
    vi.mocked(getAdventure).mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: 'Find the heir' }))
    expect(screen.getByRole('status')).toHaveTextContent('Loading the adventure…')
    finish(heir)
    const title = await screen.findByRole('heading', { level: 3, name: 'Find the heir' })
    await waitFor(() => expect(title).toHaveFocus())

    await user.click(screen.getByRole('button', { name: 'Back to adventures' }))
    expect(await screen.findByRole('button', { name: 'Find the heir' })).toHaveFocus()
  })

  it('passes status, objective, and update writes for that adventure', async () => {
    vi.mocked(listAdventures).mockResolvedValue([summarizeAdventure(heir)])
    vi.mocked(getAdventure).mockResolvedValue(heir)
    const { actions, user } = setup({ initial: { type: 'adventure', id: 'heir' } })
    await screen.findByRole('heading', { level: 3, name: 'Find the heir' })
    await user.selectOptions(screen.getByLabelText('Status'), 'Completed')
    expect(actions.changeStatus).toHaveBeenCalledWith('heir', 'completed')
    await user.type(screen.getByLabelText('Add an objective'), 'Open the vault')
    await user.click(screen.getByRole('button', { name: 'Add objective' }))
    expect(actions.addObjective).toHaveBeenCalledWith('heir', 'Open the vault')
    await user.type(screen.getByLabelText('Write an update'), 'We camped.')
    await user.click(screen.getByRole('button', { name: 'Post update' }))
    expect(actions.postUpdate).toHaveBeenCalledWith('heir', 'We camped.')
  })

  it('explains an adventure that is gone and refreshes the list behind it', async () => {
    vi.mocked(listAdventures).mockResolvedValue([])
    vi.mocked(getAdventure).mockRejectedValue(new Error('adventure_unavailable'))
    const { user } = setup({ initial: { type: 'adventure', id: 'gone' } })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This adventure is no longer available. It may have been archived.',
    )
    await waitFor(() => expect(listAdventures).toHaveBeenCalledTimes(2))
    await user.click(screen.getByRole('button', { name: 'Back to adventures' }))
    expect(await screen.findByText('No adventures yet. Start one.')).toBeVisible()
  })

  it('offers a retry when the adventure cannot be loaded', async () => {
    vi.mocked(listAdventures).mockResolvedValue([])
    // The query retries a failed read once before it shows the error.
    vi.mocked(getAdventure)
      .mockRejectedValueOnce(new Error('network down'))
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValue(heir)
    const { user } = setup({ initial: { type: 'adventure', id: 'heir' } })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This adventure could not be loaded.',
    )
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { level: 3, name: 'Find the heir' })).toBeVisible()
  })

  it('archives after a confirmation, says so, and returns to the list', async () => {
    vi.mocked(listAdventures).mockResolvedValue([summarizeAdventure(heir)])
    vi.mocked(getAdventure).mockResolvedValue(heir)
    const { actions, onNotice, user } = setup({ initial: { type: 'adventure', id: 'heir' } })
    await user.click(await screen.findByRole('button', { name: 'Archive adventure' }))
    await user.click(screen.getByRole('button', { name: 'Yes, archive' }))
    expect(actions.archive).toHaveBeenCalledWith('heir')
    expect(onNotice).toHaveBeenCalledWith('Adventure archived.')
    expect(await screen.findByRole('button', { name: 'New adventure' })).toBeVisible()
  })

  it('restores an archived adventure and stays on it', async () => {
    const archived = adventure({ ...heir, archived_at: minutesAgo(5) })
    vi.mocked(listAdventures).mockResolvedValue([summarizeAdventure(archived)])
    vi.mocked(getAdventure).mockResolvedValue(archived)
    const { actions, onNotice, user } = setup({ initial: { type: 'adventure', id: 'heir' } })
    await user.click(await screen.findByRole('button', { name: 'Restore adventure' }))
    expect(actions.restore).toHaveBeenCalledWith('heir')
    expect(onNotice).toHaveBeenCalledWith('Adventure restored.')
    expect(screen.getByRole('heading', { level: 3, name: 'Find the heir' })).toBeVisible()
  })
})

describe('editing', () => {
  it('saves against the version it opened on, says so, and returns to the adventure', async () => {
    vi.mocked(listAdventures).mockResolvedValue([summarizeAdventure(heir)])
    vi.mocked(getAdventure).mockResolvedValue(heir)
    const saved = { ...heir, title: 'Find the heiress' }
    const actions = makeActions({ save: vi.fn().mockResolvedValue({ ok: true, value: saved }) })
    const { onNotice, user } = setup({ actions, initial: { type: 'adventure', id: 'heir' } })
    await user.click(await screen.findByRole('button', { name: 'Edit details' }))
    expect(screen.getByRole('heading', { name: 'Edit adventure' })).toBeVisible()
    await user.type(screen.getByLabelText('Title'), 'ss')
    await user.click(screen.getByRole('button', { name: 'Save adventure' }))
    expect(actions.save).toHaveBeenCalledWith(
      'heir',
      expect.objectContaining({ title: 'Find the heirss' }),
      heir.updated_at,
    )
    expect(onNotice).toHaveBeenCalledWith('Adventure saved.')
    expect(await screen.findByRole('heading', { level: 3, name: 'Find the heir' })).toBeVisible()
  })

  it('keeps the editor’s text when the adventure was archived elsewhere', async () => {
    vi.mocked(listAdventures).mockResolvedValue([summarizeAdventure(heir)])
    vi.mocked(getAdventure).mockResolvedValue(heir)
    const actions = makeActions({
      save: vi.fn().mockResolvedValue({ ok: false, reason: 'unavailable' }),
    })
    const { user } = setup({ actions, initial: { type: 'adventure', id: 'heir' } })
    await user.click(await screen.findByRole('button', { name: 'Edit details' }))
    await user.type(screen.getByLabelText('Title'), '!')
    await user.click(screen.getByRole('button', { name: 'Save adventure' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/no longer available/)
    expect(screen.getByLabelText('Title')).toHaveValue('Find the heir!')
  })

  it('cancels back to the adventure', async () => {
    vi.mocked(listAdventures).mockResolvedValue([summarizeAdventure(heir)])
    vi.mocked(getAdventure).mockResolvedValue(heir)
    const { user } = setup({ initial: { type: 'adventure', id: 'heir' } })
    await user.click(await screen.findByRole('button', { name: 'Edit details' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByRole('heading', { level: 3, name: 'Find the heir' })).toBeVisible()
  })
})

describe('Waiting for you', () => {
  const owed = invitation({
    participant_id: 'p-invite',
    adventure_id: 'invited',
    title: 'The long road',
    character_id: characterId,
    invited_by: miraId,
  })
  const mira = (overrides = {}) =>
    participant({ profile_id: miraId, character_id: miraCharacterId, ...overrides })
  const proposal = participant({
    id: 'p-proposal',
    character_id: 'c-bram',
    profile_id: 'bram',
    status: 'proposed',
    approvals: [{ approver_id: miraId }],
  })
  const approving = adventure({
    id: 'approving',
    title: 'The heist',
    type: 'side',
    participants: [participant(), mira(), proposal],
  })
  const requested = adventure({
    id: 'requested',
    title: 'The vault',
    type: 'side',
    participants: [participant(), mira({ share_consent: true })],
  })

  it('lists invitations first, then adventures waiting for an approval or a consent, each with its reason', async () => {
    vi.mocked(listInvitations).mockResolvedValue([owed])
    vi.mocked(listAdventures).mockResolvedValue(
      [heir, approving, requested].map((item) => summarizeAdventure(item)),
    )
    setup()
    const waiting = await screen.findByRole('region', { name: 'Waiting for you' })
    const invite = within(waiting).getByText('The long road').closest('li')!
    expect(invite).toHaveTextContent('Side')
    expect(invite).toHaveTextContent('For Brindle')
    expect(invite).toHaveTextContent('Invited by Mira')
    expect(
      within(waiting).getByRole('button', { name: 'The heist' }).closest('li'),
    ).toHaveTextContent('Approve A character joining')
    expect(
      within(waiting).getByRole('button', { name: 'The vault' }).closest('li'),
    ).toHaveTextContent('Mira wants to share this with the party')
    // Each adventure is in one group: the waiting ones are not in Your adventures.
    const yours = screen.getByRole('region', { name: 'Your adventures' })
    expect(
      within(yours)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Find the heir'])
    // The group comes first.
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(headings.slice(0, 2)).toEqual(['Waiting for you', 'Main story'])
  })

  it('shows invitations even with no adventures, and nothing waiting when there is nothing', async () => {
    vi.mocked(listInvitations).mockResolvedValue([owed])
    vi.mocked(listAdventures).mockResolvedValue([])
    setup()
    expect(await screen.findByText('The long road')).toBeVisible()
    expect(screen.queryByText('No adventures yet. Start one.')).not.toBeInTheDocument()
    cleanup()

    vi.mocked(listInvitations).mockResolvedValue([])
    vi.mocked(listAdventures).mockResolvedValue([summarizeAdventure(heir)])
    setup()
    await screen.findByRole('region', { name: 'Your adventures' })
    expect(screen.queryByRole('region', { name: 'Waiting for you' })).not.toBeInTheDocument()
  })

  it('filters invitations by title with the rest of the board', async () => {
    vi.mocked(listInvitations).mockResolvedValue([owed])
    vi.mocked(listAdventures).mockResolvedValue([summarizeAdventure(heir)])
    const { user } = setup()
    await screen.findByText('The long road')
    await user.type(screen.getByLabelText('Filter by title'), 'heir')
    expect(screen.queryByText('The long road')).not.toBeInTheDocument()
    await user.clear(screen.getByLabelText('Filter by title'))
    await user.type(screen.getByLabelText('Filter by title'), 'road')
    expect(screen.getByText('The long road')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Find the heir' })).not.toBeInTheDocument()
  })

  it('offers a retry when the invitations cannot be loaded, without hiding the adventures', async () => {
    vi.mocked(listInvitations).mockRejectedValueOnce(new Error('network down'))
    vi.mocked(listInvitations).mockResolvedValue([owed])
    vi.mocked(listAdventures).mockResolvedValue([summarizeAdventure(heir)])
    const { user } = setup()
    const waiting = await screen.findByRole('region', { name: 'Waiting for you' })
    expect(within(waiting).getByRole('alert')).toHaveTextContent(
      'Your invitations could not be loaded.',
    )
    expect(screen.getByRole('button', { name: 'Find the heir' })).toBeVisible()
    await user.click(within(waiting).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('The long road')).toBeVisible()
    expect(screen.queryByText('Your invitations could not be loaded.')).not.toBeInTheDocument()
  })

  it('accepts an invitation and opens the adventure', async () => {
    vi.mocked(listInvitations).mockResolvedValue([owed])
    vi.mocked(listAdventures).mockResolvedValue([])
    vi.mocked(getAdventure).mockResolvedValue(adventure({ id: 'invited', title: 'The long road' }))
    const { actions, onNotice, user } = setup()
    await user.click(
      await screen.findByRole('button', { name: 'Accept the invitation to The long road' }),
    )
    expect(actions.respond).toHaveBeenCalledWith(owed, true, false)
    expect(onNotice).toHaveBeenCalledWith('You joined the adventure.')
    expect(await screen.findByRole('heading', { level: 3, name: 'The long road' })).toBeVisible()
  })

  it('declines only after a confirmation, then says so', async () => {
    vi.mocked(listInvitations).mockResolvedValue([owed])
    vi.mocked(listAdventures).mockResolvedValue([])
    const { actions, onNotice, user } = setup()
    await user.click(
      await screen.findByRole('button', { name: 'Decline the invitation to The long road' }),
    )
    expect(actions.respond).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Yes, decline' }))
    expect(actions.respond).toHaveBeenCalledWith(owed, false, false)
    expect(onNotice).toHaveBeenCalledWith('Invitation declined.')
  })

  it('keeps the invitation shared only when the box is ticked', async () => {
    const shared = invitation({ ...owed, shared_with_party: true })
    vi.mocked(listInvitations).mockResolvedValue([shared])
    vi.mocked(listAdventures).mockResolvedValue([])
    vi.mocked(getAdventure).mockResolvedValue(adventure({ id: 'invited' }))
    const { actions, user } = setup()
    const keep = await screen.findByLabelText('Keep it shared with the party')
    expect(keep).not.toBeChecked()
    expect(screen.getByText(/becomes private for everyone in it/)).toBeVisible()
    await user.click(keep)
    await user.click(screen.getByRole('button', { name: 'Accept the invitation to The long road' }))
    expect(actions.respond).toHaveBeenCalledWith(shared, true, true)
  })

  it('stays on the board when an answer fails, with the failure shown', async () => {
    vi.mocked(listInvitations).mockResolvedValue([owed])
    vi.mocked(listAdventures).mockResolvedValue([])
    const actions = makeActions({
      error: 'This invitation is no longer open.',
      respond: vi.fn().mockResolvedValue({ ok: false, reason: 'stale' }),
    })
    const { onNotice, user } = setup({ actions })
    await user.click(
      await screen.findByRole('button', { name: 'Accept the invitation to The long road' }),
    )
    expect(onNotice).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('This invitation is no longer open.')
  })
})

describe('participants in an open adventure', () => {
  const mira = (overrides = {}) =>
    participant({ profile_id: miraId, character_id: miraCharacterId, ...overrides })
  const duo = adventure({
    id: 'duo',
    title: 'Two of us',
    type: 'side',
    participants: [participant(), mira()],
  })

  it('leaves the adventure through its confirmation and returns to the board', async () => {
    vi.mocked(listAdventures).mockResolvedValue([summarizeAdventure(duo)])
    vi.mocked(getAdventure).mockResolvedValue(duo)
    const { actions, onNotice, user } = setup({ initial: { type: 'adventure', id: 'duo' } })
    await user.click(await screen.findByRole('button', { name: 'Leave adventure' }))
    await user.click(screen.getByRole('button', { name: 'Yes, leave' }))
    expect(actions.leave).toHaveBeenCalledWith('duo')
    expect(onNotice).toHaveBeenCalledWith('You left the adventure.')
    expect(await screen.findByRole('button', { name: 'New adventure' })).toBeVisible()
  })

  it('proposes a character and reports it', async () => {
    const other = character({ id: 'c-bram', name: 'Bram', owner_id: 'bram', status: 'active' })
    vi.mocked(listAdventures).mockResolvedValue([summarizeAdventure(heir)])
    vi.mocked(getAdventure).mockResolvedValue(heir)
    const actions = makeActions()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const onNotice = vi.fn()
    function Wide() {
      const [screenState, setScreen] = useState<AdventureScreen>({ type: 'adventure', id: 'heir' })
      return (
        <CampAdventures
          actions={actions as never}
          campaignId={campaignId}
          characters={[
            character({ id: characterId, name: 'Brindle', owner_id: userId, status: 'active' }),
            other,
          ]}
          enabled
          onNotice={onNotice}
          onScreenChange={setScreen}
          roster={[
            ...roster,
            { profile_id: 'bram', role: 'member', username: 'bram', display_name: 'Bram' },
          ]}
          screen={screenState}
          userId={userId}
        />
      )
    }
    render(
      <QueryClientProvider client={client}>
        <Wide />
      </QueryClientProvider>,
    )
    const user = userEvent.setup()
    await user.selectOptions(await screen.findByLabelText('Invite a character'), 'c-bram')
    await user.click(screen.getByRole('button', { name: 'Invite' }))
    await user.click(screen.getByRole('button', { name: 'Send invitation' }))
    expect(actions.propose).toHaveBeenCalledWith('heir', 'c-bram')
    expect(onNotice).toHaveBeenCalledWith('Invitation proposed.')
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Send invitation' })).not.toBeInTheDocument(),
    )
  })
})
