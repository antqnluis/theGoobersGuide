import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { adventure, miraId, objective, participant, userId } from './adventureTestData'
import { getAdventure } from './adventureService'
import { HandoffDialog } from './HandoffDialog'
import { attachHandoff } from './handoffService'
import { handoffJson, OBJ_OPEN } from './handoffTestData'

vi.mock('./handoffService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./handoffService')>()),
  attachHandoff: vi.fn(),
}))
vi.mock('./adventureService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./adventureService')>()),
  getAdventure: vi.fn(),
}))

afterEach(cleanup)
beforeEach(() => vi.resetAllMocks())

const SOURCE = '# Session 4\n\nThe party reached Saltmere.'
const STAMP = '2026-11-22T10:00:00.123456+00:00'
const OBJ_STAMP = '2026-11-22T09:00:00.000001+00:00'

const current = adventure({
  id: 'a1',
  title: 'The Drowned Bell',
  next_step: 'Go to Saltmere',
  updated_at: STAMP,
  objectives: [objective({ id: OBJ_OPEN, title: 'Find the bell', updated_at: OBJ_STAMP })],
})

function setup(
  subject = current,
  props: { onClose?: () => void; onApplied?: (count: number) => void } = {},
) {
  const onClose = props.onClose ?? vi.fn()
  const onApplied = props.onApplied ?? vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={client}>
      <HandoffDialog adventure={subject} onApplied={onApplied} onClose={onClose} userId={userId} />
    </QueryClientProvider>,
  )
  return { onApplied, onClose, user }
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
    title: 'The Drowned Bell, part two',
    next_step: 'Talk to Maren',
    objectives: [
      { op: 'add', title: 'Recover the clapper' },
      { op: 'complete', id: OBJ_OPEN },
    ],
    update: 'We reached Saltmere.',
    ...extra,
  })

const applyButton = () => screen.getByRole('button', { name: /^Apply|Saving…/ })
const sourceOnly = () => screen.getByRole('button', { name: 'Keep as source only' })

describe('HandoffDialog', () => {
  it('opens with nothing to save yet', () => {
    setup()
    expect(screen.getByRole('dialog', { name: 'Import handoff' })).toBeInTheDocument()
    expect(screen.getByLabelText('1. The handoff text')).toHaveValue('')
    expect(screen.getByLabelText('3. The assistant’s answer (JSON)')).toBeDisabled()
    expect(applyButton()).toBeDisabled()
    expect(sourceOnly()).toBeDisabled()
    expect(screen.queryByText('2. Copy the prompt')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Review' })).not.toBeInTheDocument()
  })

  it('says who will read the source', () => {
    setup()
    expect(screen.getByText(/Only you can read the source\./)).toBeVisible()
    cleanup()
    setup(adventure({ type: 'main', visibility: 'campaign', participants: [] }))
    expect(
      screen.getByText(/Everyone in this campaign can read sources on the main adventure\./),
    ).toBeVisible()
    cleanup()
    setup(adventure({ participants: [participant(), participant({ profile_id: miraId })] }))
    expect(screen.getByText(/Everyone in this adventure can read the source\./)).toBeVisible()
  })

  it('refuses a source that is too large or has control characters', async () => {
    const { user } = setup()
    await pasteSource(user, 'x'.repeat(65_537))
    expect(screen.getByRole('alert')).toHaveTextContent('Keep the handoff under 64 KB.')
    expect(sourceOnly()).toBeDisabled()
    await user.clear(screen.getByLabelText('1. The handoff text'))
    await pasteSource(user, 'bell\u0001')
    expect(screen.getByRole('alert')).toHaveTextContent('characters that can’t be kept')
    expect(sourceOnly()).toBeDisabled()
  })

  describe('the prompt', () => {
    it('appears once there is a source, and holds the source and the current adventure', async () => {
      const { user } = setup()
      await pasteSource(user)
      await user.click(screen.getByText('2. Copy the prompt'))
      const prompt = screen.getByLabelText('Handoff prompt') as HTMLTextAreaElement
      expect(prompt.value).toContain(SOURCE)
      expect(prompt.value).toContain('"title": "The Drowned Bell"')
      expect(prompt.value).toContain(OBJ_OPEN)
      expect(prompt.value).toContain('the-goobers-guide-adventure-handoff')
      await user.click(screen.getByRole('button', { name: 'Copy handoff prompt' }))
      expect(await screen.findByText('Copied')).toBeVisible()
      expect(await navigator.clipboard.readText()).toBe(prompt.value)
    })
  })

  describe('reviewing and applying', () => {
    it('shows the review, starts with nothing selected, and applies only the chosen changes', async () => {
      vi.mocked(attachHandoff).mockResolvedValue('h1')
      const { onApplied, user } = setup()
      await pasteSource(user)
      await user.type(screen.getByLabelText(/Source label/), 'session-4.md')
      await pasteJson(user, proposal())

      expect(screen.getByRole('region', { name: 'Review' })).toBeVisible()
      expect(screen.getByText(/0 of 5 changes selected\./)).toBeVisible()
      expect(applyButton()).toBeDisabled()

      await user.click(screen.getByRole('checkbox', { name: 'Next step: Talk to Maren' }))
      await user.click(screen.getByRole('checkbox', { name: 'New objective: Recover the clapper' }))
      await user.click(screen.getByRole('checkbox', { name: 'Complete objective: Find the bell' }))
      expect(applyButton()).toHaveTextContent('Apply 3 changes')
      await user.click(applyButton())

      await waitFor(() => expect(onApplied).toHaveBeenCalledWith(3))
      expect(attachHandoff).toHaveBeenCalledWith(
        'a1',
        { adventure_updated_at: STAMP, objectives: { [OBJ_OPEN]: OBJ_STAMP } },
        {
          details: { next_step: 'Talk to Maren' },
          objectives: { add: ['Recover the clapper'], update: [{ id: OBJ_OPEN, done: true }] },
        },
        SOURCE,
        'session-4.md',
      )
    })

    it('blocks a document made for another version and explains how to continue', async () => {
      const { user } = setup()
      await pasteSource(user)
      await pasteJson(
        user,
        handoffJson({
          objectives: [{ op: 'complete', id: 'ffffffff-0000-4000-8000-000000000000' }],
        }),
      )
      expect(screen.getByRole('alert')).toHaveTextContent('Copy the prompt again.')
      expect(screen.queryByRole('region', { name: 'Review' })).not.toBeInTheDocument()
      expect(applyButton()).toBeDisabled()
    })

    it('shows a problem with the JSON and keeps the source ready', async () => {
      const { user } = setup()
      await pasteSource(user)
      await pasteJson(user, '{nope')
      expect(screen.getByRole('alert')).toHaveTextContent('valid JSON')
      expect(sourceOnly()).toBeEnabled()
    })

    it('clears the selection when the document changes', async () => {
      const { user } = setup()
      await pasteSource(user)
      await pasteJson(user, proposal())
      await user.click(screen.getByRole('checkbox', { name: 'Next step: Talk to Maren' }))
      expect(applyButton()).toBeEnabled()
      await user.type(screen.getByLabelText('3. The assistant’s answer (JSON)'), ' ')
      expect(applyButton()).toBeDisabled()
    })

    it('shows safe copy when the save fails, and keeps the selection', async () => {
      vi.mocked(attachHandoff).mockRejectedValue(new Error('network down'))
      const { onApplied, user } = setup()
      await pasteSource(user)
      await pasteJson(user, proposal())
      await user.click(screen.getByRole('checkbox', { name: 'Next step: Talk to Maren' }))
      await user.click(applyButton())
      expect(await screen.findByRole('alert')).toHaveTextContent(
        "We couldn't save this handoff. Check your connection and try again.",
      )
      expect(screen.getByRole('checkbox', { name: 'Next step: Talk to Maren' })).toBeChecked()
      expect(onApplied).not.toHaveBeenCalled()
    })

    it('reports the adventure rules a database refusal comes from', async () => {
      vi.mocked(attachHandoff).mockRejectedValue(new Error('adventure_objective_limit_reached'))
      const { user } = setup()
      await pasteSource(user)
      await pasteJson(user, proposal())
      await user.click(screen.getByRole('checkbox', { name: 'New objective: Recover the clapper' }))
      await user.click(applyButton())
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'An adventure can have up to 50 objectives.',
      )
    })

    it('reloads the latest adventure on a conflict, clears the selection, and reviews again', async () => {
      vi.mocked(attachHandoff).mockRejectedValue(new Error('handoff_conflict'))
      vi.mocked(getAdventure).mockResolvedValue({
        ...current,
        next_step: 'Talk to Maren',
        updated_at: '2026-11-22T11:00:00.000000+00:00',
      })
      const { onApplied, user } = setup()
      await pasteSource(user)
      await pasteJson(user, proposal())
      await user.click(screen.getByRole('checkbox', { name: 'Next step: Talk to Maren' }))
      await user.click(applyButton())

      expect(await screen.findByRole('alert')).toHaveTextContent('The latest version is loaded')
      expect(onApplied).not.toHaveBeenCalled()
      // The same proposal is compared with the reloaded adventure: nothing is selected, and the
      // next step now matches.
      expect(applyButton()).toBeDisabled()
      const next = screen.getByRole('checkbox', { name: 'Next step: Talk to Maren' })
      expect(next).toBeDisabled()
      expect(next.closest('li')).toHaveTextContent('No change')
      // A second apply uses the reloaded version.
      vi.mocked(attachHandoff).mockResolvedValue('h1')
      await user.click(screen.getByRole('checkbox', { name: 'Title: The Drowned Bell, part two' }))
      await user.click(applyButton())
      await waitFor(() =>
        expect(attachHandoff).toHaveBeenLastCalledWith(
          'a1',
          { adventure_updated_at: '2026-11-22T11:00:00.000000+00:00', objectives: {} },
          { details: { title: 'The Drowned Bell, part two' } },
          SOURCE,
          null,
        ),
      )
    })

    it('closes when the adventure is no longer available', async () => {
      vi.mocked(attachHandoff).mockRejectedValue(new Error('adventure_unavailable'))
      const { onApplied, onClose, user } = setup()
      await pasteSource(user)
      await pasteJson(user, proposal())
      await user.click(screen.getByRole('checkbox', { name: 'Next step: Talk to Maren' }))
      await user.click(applyButton())
      await waitFor(() => expect(onClose).toHaveBeenCalled())
      expect(onApplied).not.toHaveBeenCalled()
    })
  })

  describe('keeping the source only', () => {
    it('saves the source with no changes and needs no prompt or JSON', async () => {
      vi.mocked(attachHandoff).mockResolvedValue('h1')
      const { onApplied, user } = setup()
      await pasteSource(user)
      await user.click(sourceOnly())
      await waitFor(() => expect(onApplied).toHaveBeenCalledWith(0))
      expect(attachHandoff).toHaveBeenCalledWith('a1', {}, {}, SOURCE, null)
    })

    it('ignores a selection when the source alone is kept', async () => {
      vi.mocked(attachHandoff).mockResolvedValue('h1')
      const { onApplied, user } = setup()
      await pasteSource(user)
      await pasteJson(user, proposal())
      await user.click(screen.getByRole('checkbox', { name: 'Next step: Talk to Maren' }))
      await user.click(sourceOnly())
      await waitFor(() => expect(onApplied).toHaveBeenCalledWith(0))
      expect(attachHandoff).toHaveBeenCalledWith('a1', {}, {}, SOURCE, null)
    })
  })

  describe('the label and the file', () => {
    it('refuses a label over 120 characters', async () => {
      const { user } = setup()
      await pasteSource(user)
      await user.click(screen.getByLabelText(/Source label/))
      await user.paste('x'.repeat(121))
      expect(screen.getByText('Use a source label of up to 120 characters.')).toBeVisible()
      expect(sourceOnly()).toBeDisabled()
    })

    it('fills the source and label from a file, and refuses a large one', async () => {
      const { user } = setup()
      const upload = screen.getByLabelText('Or upload a file')
      await user.upload(upload, new File([SOURCE], 'session-4.md', { type: 'text/markdown' }))
      await waitFor(() => expect(screen.getByLabelText('1. The handoff text')).toHaveValue(SOURCE))
      expect(screen.getByLabelText(/Source label/)).toHaveValue('session-4.md')

      await user.upload(upload, new File(['x'.repeat(65_537)], 'big.md', { type: 'text/markdown' }))
      expect(await screen.findByText(/This file is too large/)).toBeVisible()
    })
  })

  describe('closing', () => {
    it('closes at once when nothing was pasted', async () => {
      const { onClose, user } = setup()
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(onClose).toHaveBeenCalled()
    })

    it('asks before discarding a pasted handoff, and keeps editing on request', async () => {
      const { onClose, user } = setup()
      await pasteSource(user)
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      const confirm = screen.getByRole('alertdialog', { name: 'Discard this handoff?' })
      expect(onClose).not.toHaveBeenCalled()
      await user.click(within(confirm).getByRole('button', { name: 'Keep editing' }))
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      expect(screen.getByLabelText('1. The handoff text')).toHaveValue(SOURCE)

      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      await user.click(screen.getByRole('button', { name: 'Discard handoff' }))
      expect(onClose).toHaveBeenCalled()
    })
  })
})
