import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { character } from '../characters/characterTestData'
import { CampNotes, type NoteScreen } from './CampNotes'
import { campaignId, miraId, note, roster, userId } from './noteTestData'
import { summarizeNote } from './noteRules'
import { getNote, listNotes } from './noteService'
import type { Note } from './noteTypes'

vi.mock('./noteService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./noteService')>()),
  listNotes: vi.fn(),
  getNote: vi.fn(),
}))

afterEach(cleanup)
beforeEach(() => {
  vi.resetAllMocks()
})

function makeActions(overrides: Record<string, unknown> = {}) {
  return {
    error: null as string | null,
    clearError: vi.fn(),
    pendingAction: null as string | null,
    pendingNoteId: null as string | null,
    create: vi.fn(),
    save: vi.fn(),
    changeVisibility: vi.fn(),
    remove: vi.fn().mockResolvedValue(true),
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
  initial?: NoteScreen
  onDirtyChange?: (dirty: boolean) => void
  onNotice: (notice: string) => void
}) {
  const [screen, setScreen] = useState<NoteScreen>(initial)
  return (
    <CampNotes
      actions={actions as never}
      campaignId={campaignId}
      characters={[character({ id: 'c-brand', name: 'Brand' })]}
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
    initial?: NoteScreen
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

const mine = note({ id: 'mine', title: 'My secret', updated_at: minutesAgo(30) })
const shared = note({
  id: 'shared',
  title: 'Party plan',
  visibility: 'campaign',
  author_id: miraId,
  updated_by: miraId,
  updated_at: minutesAgo(5),
  character_id: 'c-brand',
})
const sharedMine = note({
  id: 'sharedMine',
  title: 'Map of Landfall',
  visibility: 'campaign',
  updated_at: minutesAgo(130),
})

describe('the notes list', () => {
  it('shows a loading state, then the two groups newest edit first', async () => {
    vi.mocked(listNotes).mockResolvedValue([mine, shared, sharedMine].map(summarizeNote))
    setup()
    expect(screen.getByRole('status')).toHaveTextContent('Loading the notes…')

    const sharedGroup = await screen.findByRole('region', { name: 'Shared with the campaign' })
    const privateGroup = screen.getByRole('region', { name: 'Only you' })
    expect(
      within(sharedGroup)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Party plan', 'Map of Landfall'])
    expect(
      within(privateGroup)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['My secret'])
    expect(listNotes).toHaveBeenCalledWith(campaignId)
  })

  it('shows the author, the last edit, and the linked character on each row', async () => {
    vi.mocked(listNotes).mockResolvedValue([shared, sharedMine].map(summarizeNote))
    setup()
    const row = (await screen.findByRole('button', { name: 'Party plan' })).closest('li')!
    expect(row).toHaveTextContent('Mira')
    expect(row).toHaveTextContent('Edited by Mira, 5 minutes ago')
    expect(row).toHaveTextContent('About Brand')
    const own = screen.getByRole('button', { name: 'Map of Landfall' }).closest('li')!
    expect(own).toHaveTextContent('You')
    expect(own).toHaveTextContent('Edited by you, 2 hours ago')
  })

  it('offers the first note when there are none', async () => {
    vi.mocked(listNotes).mockResolvedValue([])
    setup()
    expect(await screen.findByText('No notes yet. Write the first one.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'New note' })).toBeEnabled()
    expect(screen.queryByLabelText('Filter by title')).not.toBeInTheDocument()
  })

  it('filters by title and says when nothing matches', async () => {
    vi.mocked(listNotes).mockResolvedValue([mine, shared, sharedMine].map(summarizeNote))
    const { user } = setup()
    const filter = await screen.findByLabelText('Filter by title')
    await user.type(filter, 'land')
    expect(screen.getByRole('button', { name: 'Map of Landfall' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Party plan' })).not.toBeInTheDocument()
    await user.clear(filter)
    await user.type(filter, 'zzz')
    expect(screen.getByRole('status')).toHaveTextContent('No notes match “zzz”.')
  })

  it('shows an error with a retry', async () => {
    vi.mocked(listNotes).mockRejectedValueOnce(new Error('boom'))
    vi.mocked(listNotes).mockResolvedValueOnce([summarizeNote(mine)])
    const { user } = setup()
    expect(await screen.findByRole('alert')).toHaveTextContent('The notes could not be loaded.')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('button', { name: 'My secret' })).toBeVisible()
  })

  it('shows a failed action above the list', async () => {
    vi.mocked(listNotes).mockResolvedValue([summarizeNote(mine)])
    setup({ actions: makeActions({ error: 'We couldn’t delete this note. Try again.' }) })
    expect(await screen.findByRole('alert')).toHaveTextContent('We couldn’t delete this note')
  })
})

describe('opening and reading', () => {
  it('opens a note, focuses its heading, and comes back to its row', async () => {
    vi.mocked(listNotes).mockResolvedValue([summarizeNote(mine)])
    vi.mocked(getNote).mockResolvedValue(mine)
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: 'My secret' }))
    const heading = await screen.findByRole('heading', { name: 'My secret' })
    expect(heading).toHaveFocus()
    expect(getNote).toHaveBeenCalledWith('mine')

    await user.click(screen.getByRole('button', { name: 'Back to notes' }))
    expect(await screen.findByRole('button', { name: 'My secret' })).toHaveFocus()
  })

  it('says when a note is no longer available, and refreshes the list', async () => {
    vi.mocked(listNotes).mockResolvedValue([summarizeNote(mine)])
    vi.mocked(getNote).mockRejectedValue(new Error('note_unavailable'))
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: 'My secret' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This note is no longer available. It may have been made private or deleted.',
    )
    await waitFor(() => expect(listNotes).toHaveBeenCalledTimes(2))
    await user.click(screen.getByRole('button', { name: 'Back to notes' }))
    expect(await screen.findByRole('button', { name: 'New note' })).toBeVisible()
  })

  it('offers a retry when a note cannot be loaded', async () => {
    vi.mocked(listNotes).mockResolvedValue([summarizeNote(mine)])
    // The query retries once on its own, so it takes two failures to give up.
    vi.mocked(getNote).mockRejectedValueOnce(new Error('boom'))
    vi.mocked(getNote).mockRejectedValueOnce(new Error('boom'))
    vi.mocked(getNote).mockResolvedValueOnce(mine)
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: 'My secret' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This note could not be loaded.')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'My secret' })).toBeVisible()
  })

  it('shares and hides a note through the actions, with a notice', async () => {
    vi.mocked(listNotes).mockResolvedValue([summarizeNote(mine)])
    vi.mocked(getNote).mockResolvedValue(mine)
    const actions = makeActions({
      changeVisibility: vi
        .fn()
        .mockResolvedValue({ ok: true, note: { ...mine, visibility: 'campaign' } }),
    })
    const { onNotice, user } = setup({ actions })
    await user.click(await screen.findByRole('button', { name: 'My secret' }))
    await user.click(await screen.findByRole('button', { name: 'Share with the campaign' }))
    expect(actions.changeVisibility).toHaveBeenCalledWith('mine', 'campaign', mine.updated_at)
    expect(onNotice).toHaveBeenCalledWith('Note shared with the campaign.')
  })

  it('says the note changed when a share loses a race, without making the change', async () => {
    vi.mocked(listNotes).mockResolvedValue([summarizeNote(mine)])
    vi.mocked(getNote).mockResolvedValue(mine)
    const actions = makeActions({
      changeVisibility: vi
        .fn()
        .mockResolvedValue({ ok: false, reason: 'conflict', latest: { ...mine, body: 'new' } }),
    })
    const { onNotice, user } = setup({ actions })
    await user.click(await screen.findByRole('button', { name: 'My secret' }))
    await user.click(await screen.findByRole('button', { name: 'Share with the campaign' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This note changed just now.')
    expect(onNotice).not.toHaveBeenCalled()
  })

  it('deletes a note, returns to the list, and says so', async () => {
    vi.mocked(listNotes).mockResolvedValue([summarizeNote(mine)])
    vi.mocked(getNote).mockResolvedValue(mine)
    const { actions, onNotice, user } = setup()
    await user.click(await screen.findByRole('button', { name: 'My secret' }))
    await user.click(await screen.findByRole('button', { name: 'Delete note' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete note' }))
    expect(actions.remove).toHaveBeenCalledWith('mine')
    expect(onNotice).toHaveBeenCalledWith('Note deleted.')
    expect(await screen.findByRole('button', { name: 'New note' })).toBeVisible()
  })
})

describe('writing', () => {
  it('creates a note, says so, and opens it', async () => {
    vi.mocked(listNotes).mockResolvedValue([])
    const created: Note = note({ id: 'fresh', title: 'Fresh', body: 'new' })
    vi.mocked(getNote).mockResolvedValue(created)
    const actions = makeActions({ create: vi.fn().mockResolvedValue({ ok: true, note: created }) })
    const { onNotice, user } = setup({ actions })
    await user.click(await screen.findByRole('button', { name: 'New note' }))
    expect(screen.getByLabelText('Title')).toHaveFocus()
    await user.type(screen.getByLabelText('Title'), 'Fresh')
    await user.type(screen.getByLabelText(/^Note/), 'new')
    await user.click(screen.getByRole('button', { name: 'Create note' }))

    expect(actions.create).toHaveBeenCalledWith({
      title: 'Fresh',
      body: 'new',
      visibility: 'private',
      character_id: null,
    })
    expect(onNotice).toHaveBeenCalledWith('Note created.')
    expect(await screen.findByRole('heading', { name: 'Fresh' })).toBeVisible()
  })

  it('edits against the note’s own stamp and returns to it', async () => {
    vi.mocked(listNotes).mockResolvedValue([summarizeNote(mine)])
    vi.mocked(getNote).mockResolvedValue(mine)
    const saved = { ...mine, title: 'My secret II' }
    const actions = makeActions({ save: vi.fn().mockResolvedValue({ ok: true, note: saved }) })
    const { onNotice, user } = setup({ actions })
    await user.click(await screen.findByRole('button', { name: 'My secret' }))
    await user.click(await screen.findByRole('button', { name: 'Edit note' }))
    await user.type(screen.getByLabelText('Title'), ' II')
    await user.click(screen.getByRole('button', { name: 'Save note' }))

    expect(actions.save).toHaveBeenCalledWith(
      'mine',
      { title: 'My secret II', body: mine.body, character_id: null },
      mine.updated_at,
    )
    expect(onNotice).toHaveBeenCalledWith('Note saved.')
  })

  it('keeps the editor open with the writer’s text when the note disappears meanwhile', async () => {
    vi.mocked(listNotes).mockResolvedValue([summarizeNote(mine)])
    vi.mocked(getNote).mockResolvedValue(mine)
    const actions = makeActions({
      save: vi.fn().mockResolvedValue({ ok: false, reason: 'unavailable' }),
    })
    const { user } = setup({ actions })
    await user.click(await screen.findByRole('button', { name: 'My secret' }))
    await user.click(await screen.findByRole('button', { name: 'Edit note' }))
    await user.type(screen.getByLabelText(/^Note/), ' more')
    await user.click(screen.getByRole('button', { name: 'Save note' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This note is no longer available.')
    expect(screen.getByLabelText(/^Note/)).toHaveValue(`${mine.body} more`)
  })
})

describe('unsaved text', () => {
  it('asks before cancelling a new note with text, and stays when told to', async () => {
    vi.mocked(listNotes).mockResolvedValue([])
    const onDirtyChange = vi.fn()
    const { user } = setup({ onDirtyChange })
    await user.click(await screen.findByRole('button', { name: 'New note' }))
    await user.type(screen.getByLabelText('Title'), 'Draft')
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true))

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Going back now will discard them')
    await user.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.getByLabelText('Title')).toHaveValue('Draft')
  })

  it('discards the text and goes back when told to', async () => {
    vi.mocked(listNotes).mockResolvedValue([])
    const onDirtyChange = vi.fn()
    const { user } = setup({ onDirtyChange })
    await user.click(await screen.findByRole('button', { name: 'New note' }))
    await user.type(screen.getByLabelText('Title'), 'Draft')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Discard and go back' }))
    expect(await screen.findByRole('button', { name: 'New note' })).toBeVisible()
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false))
  })

  it('cancels with nothing typed straight away, and an edit cancels back to the note', async () => {
    vi.mocked(listNotes).mockResolvedValue([summarizeNote(mine)])
    vi.mocked(getNote).mockResolvedValue(mine)
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: 'New note' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'New note' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'My secret' }))
    await user.click(await screen.findByRole('button', { name: 'Edit note' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByRole('heading', { name: 'My secret' })).toBeVisible()
  })
})
