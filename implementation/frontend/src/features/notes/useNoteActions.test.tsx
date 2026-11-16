import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createNote,
  deleteNote,
  NoteConflictError,
  saveNote,
  setNoteVisibility,
} from './noteService'
import type { Note, NoteCreateValues, NoteSummary, NoteValues } from './noteTypes'
import { summarizeNote } from './noteRules'
import { useNoteActions } from './useNoteActions'

vi.mock('./noteService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./noteService')>()),
  createNote: vi.fn(),
  saveNote: vi.fn(),
  setNoteVisibility: vi.fn(),
  deleteNote: vi.fn(),
}))

const campaignId = '00000000-0000-4000-8000-000000000011'
const userId = '00000000-0000-4000-8000-000000000001'
const listKey = ['campaigns', 'notes', campaignId, userId]
const detailKey = (id: string) => ['campaigns', 'notes', 'detail', id, userId]
const campaignDetailKey = ['campaigns', 'detail', campaignId, userId]
const rosterKey = ['campaigns', 'roster', campaignId, userId]

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: 'n1',
    campaign_id: campaignId,
    author_id: userId,
    visibility: 'private',
    title: 'Clues',
    body: 'text',
    character_id: null,
    updated_by: userId,
    created_at: '2026-11-16T10:00:00+00:00',
    updated_at: '2026-11-16T10:00:00+00:00',
    ...overrides,
  }
}

const first = note({ id: 'n1', title: 'First' })
const second = note({ id: 'n2', title: 'Second', visibility: 'campaign' })
const values: NoteValues = { title: 'Edited', body: 'new text', character_id: null }
const createValues: NoteCreateValues = { ...values, visibility: 'private' }

function setup(list: NoteSummary[] | null = [summarizeNote(first), summarizeNote(second)]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (list) queryClient.setQueryData(listKey, list)
  queryClient.setQueryData(detailKey('n1'), first)
  queryClient.setQueryData(detailKey('n2'), second)
  for (const key of [campaignDetailKey, rosterKey]) queryClient.setQueryData(key, 'cached')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(() => useNoteActions(campaignId, userId), { wrapper })
  return { queryClient, result }
}

const stale = (queryClient: QueryClient, key: readonly unknown[]) =>
  queryClient.getQueryState(key)?.isInvalidated
const cachedList = (queryClient: QueryClient) => queryClient.getQueryData<NoteSummary[]>(listKey)

afterEach(cleanup)
beforeEach(() => {
  vi.resetAllMocks()
})

describe('create', () => {
  it('writes the new note to both caches without its body in the list, and refreshes the list', async () => {
    const created = note({ id: 'n3', title: 'Third', body: 'secret' })
    vi.mocked(createNote).mockResolvedValue(created)
    const { queryClient, result } = setup()

    let outcome: Awaited<ReturnType<typeof result.current.create>> | undefined
    await act(async () => {
      outcome = await result.current.create(createValues)
    })

    expect(outcome).toEqual({ ok: true, note: created })
    expect(createNote).toHaveBeenCalledWith(campaignId, createValues)
    expect(queryClient.getQueryData(detailKey('n3'))).toEqual(created)
    const list = cachedList(queryClient)!
    expect(list.map((row) => row.id)).toEqual(['n3', 'n1', 'n2'])
    expect('body' in list[0]).toBe(false)
    expect(stale(queryClient, listKey)).toBe(true)
    expect(result.current.error).toBeNull()
    expect(result.current.pendingAction).toBeNull()
  })

  it('leaves an unloaded list alone', async () => {
    vi.mocked(createNote).mockResolvedValue(note({ id: 'n3' }))
    const { queryClient, result } = setup(null)
    await act(async () => {
      await result.current.create(createValues)
    })
    expect(queryClient.getQueryData(listKey)).toBeUndefined()
  })

  it('shows the cap and link copy and keeps the caches', async () => {
    const { queryClient, result } = setup()
    for (const [message, copy] of [
      [
        'note_limit_reached',
        'You can keep up to 500 notes in a campaign. Delete one to add another.',
      ],
      [
        'note_character_unavailable',
        'That character is no longer in this campaign. Choose another or remove the link.',
      ],
    ]) {
      vi.mocked(createNote).mockRejectedValue({ code: 'P0001', message })
      let outcome: unknown
      await act(async () => {
        outcome = await result.current.create(createValues)
      })
      expect(outcome).toEqual({ ok: false, reason: 'failed' })
      expect(result.current.error).toBe(copy)
    }
    expect(cachedList(queryClient)).toHaveLength(2)
  })

  it('treats a lost membership as unavailable and refreshes the campaign', async () => {
    vi.mocked(createNote).mockRejectedValue(new Error('note_campaign_unavailable'))
    const { queryClient, result } = setup()
    let outcome: unknown
    await act(async () => {
      outcome = await result.current.create(createValues)
    })
    expect(outcome).toEqual({ ok: false, reason: 'unavailable' })
    expect(result.current.error).toBe('You can no longer add notes to this campaign.')
    expect(stale(queryClient, listKey)).toBe(true)
    expect(stale(queryClient, campaignDetailKey)).toBe(true)
    expect(stale(queryClient, rosterKey)).toBe(true)
  })

  it('uses safe fallback copy for unknown failures', async () => {
    vi.mocked(createNote).mockRejectedValue(new Error('network down'))
    const { result } = setup()
    await act(async () => {
      await result.current.create(createValues)
    })
    expect(result.current.error).toBe(
      "We couldn't save this note. Check your connection and try again.",
    )
  })
})

describe('save', () => {
  it('replaces the detail and the list row and refreshes the list', async () => {
    const saved = note({
      id: 'n1',
      title: 'Edited',
      body: 'new text',
      updated_at: '2026-11-16T11:00:00+00:00',
    })
    vi.mocked(saveNote).mockResolvedValue(saved)
    const { queryClient, result } = setup()

    let outcome: unknown
    await act(async () => {
      outcome = await result.current.save('n1', values, first.updated_at)
    })

    expect(outcome).toEqual({ ok: true, note: saved })
    expect(saveNote).toHaveBeenCalledWith('n1', values, first.updated_at)
    expect(queryClient.getQueryData(detailKey('n1'))).toEqual(saved)
    expect(cachedList(queryClient)!.find((row) => row.id === 'n1')?.title).toBe('Edited')
    expect(cachedList(queryClient)).toHaveLength(2)
    expect(stale(queryClient, listKey)).toBe(true)
  })

  it('reports the pending action and note while the save runs', async () => {
    let finish: (value: Note) => void = () => {}
    vi.mocked(saveNote).mockReturnValue(new Promise<Note>((resolve) => (finish = resolve)))
    const { result } = setup()

    let running: Promise<unknown> = Promise.resolve()
    act(() => {
      running = result.current.save('n1', values, first.updated_at)
    })
    expect(result.current.pendingAction).toBe('save')
    expect(result.current.pendingNoteId).toBe('n1')

    await act(async () => {
      finish(first)
      await running
    })
    expect(result.current.pendingAction).toBeNull()
    expect(result.current.pendingNoteId).toBeNull()
  })

  it('hands back the latest version on a conflict and adopts it in the caches', async () => {
    const latest = note({
      id: 'n1',
      title: 'By someone else',
      updated_at: '2026-11-16T11:30:00+00:00',
    })
    vi.mocked(saveNote).mockRejectedValue(new NoteConflictError(latest))
    const { queryClient, result } = setup()

    let outcome: unknown
    await act(async () => {
      outcome = await result.current.save('n1', values, first.updated_at)
    })

    expect(outcome).toEqual({ ok: false, reason: 'conflict', latest })
    expect(result.current.error).toBe(
      'This note changed while you were editing. Your text is still here.',
    )
    expect(queryClient.getQueryData(detailKey('n1'))).toEqual(latest)
    expect(cachedList(queryClient)!.find((row) => row.id === 'n1')?.title).toBe('By someone else')
    expect(stale(queryClient, listKey)).toBe(true)
  })

  it('forgets a note that is no longer readable and refetches the list', async () => {
    vi.mocked(saveNote).mockRejectedValue(new Error('note_unavailable'))
    const { queryClient, result } = setup()

    let outcome: unknown
    await act(async () => {
      outcome = await result.current.save('n2', values, second.updated_at)
    })

    expect(outcome).toEqual({ ok: false, reason: 'unavailable' })
    expect(result.current.error).toBe(
      'This note is no longer available. It may have been made private or deleted.',
    )
    expect(queryClient.getQueryData(detailKey('n2'))).toBeUndefined()
    expect(cachedList(queryClient)!.map((row) => row.id)).toEqual(['n1'])
    expect(stale(queryClient, listKey)).toBe(true)
  })

  it('clears the previous error when the next action starts', async () => {
    vi.mocked(saveNote).mockRejectedValueOnce(new Error('network down'))
    vi.mocked(saveNote).mockResolvedValueOnce(first)
    const { result } = setup()
    await act(async () => {
      await result.current.save('n1', values, first.updated_at)
    })
    expect(result.current.error).not.toBeNull()
    await act(async () => {
      await result.current.save('n1', values, first.updated_at)
    })
    expect(result.current.error).toBeNull()
  })

  it('lets the surface clear the error', async () => {
    vi.mocked(saveNote).mockRejectedValue(new Error('network down'))
    const { result } = setup()
    await act(async () => {
      await result.current.save('n1', values, first.updated_at)
    })
    act(() => result.current.clearError())
    expect(result.current.error).toBeNull()
  })
})

describe('changeVisibility', () => {
  it('updates both caches, so a note moves between the list groups', async () => {
    const shared = note({
      id: 'n1',
      visibility: 'campaign',
      updated_at: '2026-11-16T11:00:00+00:00',
    })
    vi.mocked(setNoteVisibility).mockResolvedValue(shared)
    const { queryClient, result } = setup()

    await act(async () => {
      await result.current.changeVisibility('n1', 'campaign', first.updated_at)
    })

    expect(setNoteVisibility).toHaveBeenCalledWith('n1', 'campaign', first.updated_at)
    expect(queryClient.getQueryData<Note>(detailKey('n1'))?.visibility).toBe('campaign')
    expect(cachedList(queryClient)!.find((row) => row.id === 'n1')?.visibility).toBe('campaign')
  })

  it('uses its own fallback copy', async () => {
    vi.mocked(setNoteVisibility).mockRejectedValue(new Error('network down'))
    const { result } = setup()
    await act(async () => {
      await result.current.changeVisibility('n1', 'campaign', first.updated_at)
    })
    expect(result.current.error).toBe(
      "We couldn't change who can see this note. Check your connection and try again.",
    )
  })

  it('treats the author-only guard as a generic failure', async () => {
    vi.mocked(setNoteVisibility).mockRejectedValue({
      code: '42501',
      message: 'note_visibility_author_only',
    })
    const { result } = setup()
    let outcome: unknown
    await act(async () => {
      outcome = await result.current.changeVisibility('n2', 'private', second.updated_at)
    })
    expect(outcome).toEqual({ ok: false, reason: 'failed' })
    expect(result.current.error).toBe(
      "We couldn't change who can see this note. Check your connection and try again.",
    )
  })
})

describe('remove', () => {
  it('removes the note from both caches and refreshes the list', async () => {
    vi.mocked(deleteNote).mockResolvedValue(undefined)
    const { queryClient, result } = setup()

    let gone = false
    await act(async () => {
      gone = await result.current.remove('n1')
    })

    expect(gone).toBe(true)
    expect(deleteNote).toHaveBeenCalledWith('n1')
    expect(queryClient.getQueryData(detailKey('n1'))).toBeUndefined()
    expect(cachedList(queryClient)!.map((row) => row.id)).toEqual(['n2'])
    expect(stale(queryClient, listKey)).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it('counts an already-unavailable note as gone, with the unavailable copy', async () => {
    vi.mocked(deleteNote).mockRejectedValue(new Error('note_unavailable'))
    const { queryClient, result } = setup()

    let gone = false
    await act(async () => {
      gone = await result.current.remove('n2')
    })

    expect(gone).toBe(true)
    expect(cachedList(queryClient)!.map((row) => row.id)).toEqual(['n1'])
    expect(result.current.error).toBe(
      'This note is no longer available. It may have been made private or deleted.',
    )
  })

  it('keeps the note and shows the fallback copy when the delete fails', async () => {
    vi.mocked(deleteNote).mockRejectedValue(new Error('network down'))
    const { queryClient, result } = setup()

    let gone = true
    await act(async () => {
      gone = await result.current.remove('n1')
    })

    expect(gone).toBe(false)
    expect(result.current.error).toBe(
      "We couldn't delete this note. Check your connection and try again.",
    )
    expect(cachedList(queryClient)).toHaveLength(2)
    expect(queryClient.getQueryData(detailKey('n1'))).toEqual(first)
    expect(result.current.pendingAction).toBeNull()
  })
})
