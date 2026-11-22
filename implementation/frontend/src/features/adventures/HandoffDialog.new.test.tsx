import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { adventure, characterId, userId } from './adventureTestData'
import { HandoffDialog } from './HandoffDialog'
import { createAdventureFromHandoff } from './handoffService'
import { handoffJson, OBJ_OPEN } from './handoffTestData'

vi.mock('./handoffService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./handoffService')>()),
  createAdventureFromHandoff: vi.fn(),
}))

afterEach(cleanup)
beforeEach(() => vi.resetAllMocks())

const SOURCE = '# Session 1\n\nThe party reached Saltmere.'
const created = adventure({ id: 'new1', title: 'The Drowned Bell' })
const brindle = { id: characterId, name: 'Brindle', status: 'active' as const }
const ash = { id: 'char-2', name: 'Ash', status: 'retired' as const }

function setup(
  props: {
    characters?: (typeof brindle | typeof ash)[]
    defaultCharacterId?: string | null
    onClose?: () => void
    onCreated?: (adventure: typeof created, count: number) => void
  } = {},
) {
  const onClose = props.onClose ?? vi.fn()
  const onCreated = props.onCreated ?? vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={client}>
      <HandoffDialog
        create={{
          campaignId: 'camp1',
          characters: props.characters ?? [brindle, ash],
          defaultCharacterId:
            props.defaultCharacterId === undefined ? brindle.id : props.defaultCharacterId,
        }}
        onClose={onClose}
        onCreated={onCreated}
        userId={userId}
      />
    </QueryClientProvider>,
  )
  return { onClose, onCreated, user }
}

async function pasteSource(user: ReturnType<typeof userEvent.setup>, text = SOURCE) {
  await user.click(screen.getByLabelText('1. The handoff text'))
  await user.paste(text)
}

async function pasteJson(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.click(screen.getByLabelText('3. The assistant’s answer (JSON)'))
  await user.paste(text)
}

const proposal = (extra: Record<string, unknown> = {}) =>
  handoffJson({
    title: 'The Drowned Bell',
    status: 'in_progress',
    next_step: 'Go to Saltmere',
    objectives: [
      { op: 'add', title: 'Recover the clapper' },
      { op: 'add', title: 'Ask Maren' },
    ],
    update: 'We began.',
    ...extra,
  })

const createButton = () => screen.getByRole('button', { name: /^Create adventure|Saving…/ })

describe('HandoffDialog in new mode', () => {
  it('opens with the pickers, no source-only shortcut, and nothing to create yet', () => {
    setup()
    expect(screen.getByRole('dialog', { name: 'Start from a handoff' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Personal' })).toBeChecked()
    expect(screen.getByLabelText('For which character')).toHaveValue(brindle.id)
    expect(screen.getByLabelText(/What is this about/)).toHaveValue('')
    expect(createButton()).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Keep as source only' })).not.toBeInTheDocument()
    expect(screen.getByText(/A new personal or side adventure starts private/)).toBeVisible()
  })

  it('lists the player’s characters with their status, and hides the picker for a main adventure', async () => {
    const { user } = setup()
    expect(screen.getByRole('option', { name: 'Ash (retired)' })).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Main' }))
    expect(screen.queryByLabelText('For which character')).not.toBeInTheDocument()
    expect(
      screen.getByText(/Everyone in this campaign can read sources on the main adventure\./),
    ).toBeVisible()
  })

  it('explains a missing character and still allows a main adventure', async () => {
    const { user } = setup({ characters: [], defaultCharacterId: null })
    expect(screen.getByText(/belongs to one of your characters/)).toBeVisible()
    await pasteSource(user)
    await pasteJson(user, proposal())
    expect(createButton()).toBeDisabled()
    await user.click(screen.getByRole('radio', { name: 'Main' }))
    expect(createButton()).toBeEnabled()
  })

  it('uses the hint as the focus of the prompt, and has no current adventure in it', async () => {
    const { user } = setup()
    await user.type(screen.getByLabelText(/What is this about/), 'the missing bell')
    await pasteSource(user)
    await user.click(screen.getByText('2. Copy the prompt'))
    const prompt = (screen.getByLabelText('Handoff prompt') as HTMLTextAreaElement).value
    expect(prompt).toContain('The thread is: the missing bell')
    expect(prompt).toContain(SOURCE)
    expect(prompt).not.toContain('CURRENT ADVENTURE')
    expect(prompt).toContain('You are starting a new adventure')
  })

  it('refuses a hint over 120 characters', async () => {
    const { user } = setup()
    await user.click(screen.getByLabelText(/What is this about/))
    await user.paste('x'.repeat(121))
    expect(screen.getByText('Use a short description of up to 120 characters.')).toBeVisible()
    await pasteSource(user)
    await pasteJson(user, proposal())
    expect(createButton()).toBeDisabled()
  })

  it('selects every valid proposal except the status, which is the player’s own pick (H6)', async () => {
    const { user } = setup()
    await pasteSource(user)
    await pasteJson(user, proposal())
    for (const name of [
      'Title: The Drowned Bell',
      'Next step: Go to Saltmere',
      'New objective: Recover the clapper',
      'New objective: Ask Maren',
      'Progress update',
    ]) {
      expect(screen.getByRole('checkbox', { name }), name).toBeChecked()
    }
    // The status is not a row; the player's pick starts at Pending.
    expect(screen.queryByRole('checkbox', { name: /^Status/ })).not.toBeInTheDocument()
    const status = screen.getByLabelText('Status of the new adventure')
    expect(status).toHaveValue('pending')
    expect(screen.getByText(/The handoff proposes In progress\./)).toBeVisible()
    expect(createButton()).toHaveTextContent('Create adventure with 5 changes')
  })

  it('says only the player decides when the handoff proposes Completed', async () => {
    const { user } = setup()
    await pasteSource(user)
    await pasteJson(user, proposal({ status: 'completed' }))
    expect(screen.getByLabelText('Status of the new adventure')).toHaveValue('pending')
    expect(
      screen.getByText(/The handoff suggests this\. Only you decide it’s done\./),
    ).toBeVisible()
  })

  it('creates with the selected parts, the chosen type, character, status, and the source', async () => {
    vi.mocked(createAdventureFromHandoff).mockResolvedValue(created)
    const { onCreated, user } = setup()
    await user.click(screen.getByRole('radio', { name: 'Side' }))
    await pasteSource(user)
    await user.type(screen.getByLabelText(/Source label/), 'session-1.md')
    await pasteJson(user, proposal())
    await user.click(screen.getByRole('checkbox', { name: 'New objective: Ask Maren' }))
    await user.selectOptions(screen.getByLabelText('Status of the new adventure'), 'in_progress')
    expect(createButton()).toHaveTextContent('Create adventure with 5 changes')
    await user.click(createButton())

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created, 5))
    expect(createAdventureFromHandoff).toHaveBeenCalledWith(
      'camp1',
      'side',
      brindle.id,
      {
        details: { title: 'The Drowned Bell', next_step: 'Go to Saltmere', status: 'in_progress' },
        objectives: { add: ['Recover the clapper'] },
        update: 'We began.',
      },
      SOURCE,
      'session-1.md',
    )
  })

  it('creates a main adventure with no character', async () => {
    vi.mocked(createAdventureFromHandoff).mockResolvedValue(created)
    const { onCreated, user } = setup()
    await user.click(screen.getByRole('radio', { name: 'Main' }))
    await pasteSource(user)
    await pasteJson(user, proposal())
    await user.click(createButton())
    await waitFor(() => expect(onCreated).toHaveBeenCalled())
    expect(vi.mocked(createAdventureFromHandoff).mock.calls[0].slice(1, 3)).toEqual(['main', null])
  })

  it('needs a title: without one selected nothing is created', async () => {
    const { user } = setup()
    await pasteSource(user)
    await pasteJson(user, handoffJson({ update: 'Only an update' }))
    expect(createButton()).toBeDisabled()
    expect(screen.getByText(/A new adventure needs a title\./)).toBeVisible()

    cleanup()
    const second = setup()
    await pasteSource(second.user)
    await pasteJson(second.user, proposal())
    await second.user.click(screen.getByRole('checkbox', { name: 'Title: The Drowned Bell' }))
    expect(createButton()).toBeDisabled()
    expect(createAdventureFromHandoff).not.toHaveBeenCalled()
  })

  it('blocks a document that targets objectives, because a new adventure has none', async () => {
    const { user } = setup()
    await pasteSource(user)
    await pasteJson(user, proposal({ objectives: [{ op: 'complete', id: OBJ_OPEN }] }))
    expect(screen.getByRole('alert')).toHaveTextContent('Copy the prompt again.')
    expect(createButton()).toBeDisabled()
  })

  it('shows safe copy when creating fails, creates nothing, and keeps the selection', async () => {
    vi.mocked(createAdventureFromHandoff).mockRejectedValue(new Error('adventure_limit_reached'))
    const { onCreated, user } = setup()
    await pasteSource(user)
    await pasteJson(user, proposal())
    await user.click(createButton())
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You can keep up to 200 adventures in a campaign',
    )
    expect(onCreated).not.toHaveBeenCalled()
    expect(screen.getByRole('checkbox', { name: 'Title: The Drowned Bell' })).toBeChecked()
    expect(createButton()).toBeEnabled()
  })

  it('tells a player who left the campaign, and any unknown failure, apart', async () => {
    vi.mocked(createAdventureFromHandoff).mockRejectedValueOnce(
      new Error('adventure_campaign_unavailable'),
    )
    const { user } = setup()
    await pasteSource(user)
    await pasteJson(user, proposal())
    await user.click(createButton())
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You can no longer add adventures to this campaign.',
    )
    vi.mocked(createAdventureFromHandoff).mockRejectedValueOnce(new Error('network down'))
    await user.click(createButton())
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        "We couldn't start this adventure. Check your connection and try again.",
      ),
    )
  })

  it('asks before discarding a pasted handoff', async () => {
    const { onClose, user } = setup()
    await pasteSource(user)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('alertdialog', { name: 'Discard this handoff?' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Discard handoff' }))
    expect(onClose).toHaveBeenCalled()
  })
})
