import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '../../lib/supabase'
import {
  createNote,
  deleteNote,
  getNote,
  isNoteConflict,
  isNoteUnavailable,
  listNotes,
  noteError,
  NoteConflictError,
  saveNote,
  setNoteVisibility,
} from './noteService'
import type { Note, NoteCreateValues, NoteValues } from './noteTypes'

vi.mock('../../lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))

const campaignId = '00000000-0000-4000-8000-000000000011'
const noteId = '00000000-0000-4000-8000-000000000041'

/** A chainable query builder that records calls and resolves to `result`. */
function builder(result: { data: unknown; error: unknown }) {
  const calls: [string, unknown[]][] = []
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'order', 'insert', 'update', 'delete']) {
    chain[method] = (...args: unknown[]) => {
      calls.push([method, args])
      return chain
    }
  }
  chain.maybeSingle = () => Promise.resolve(result)
  chain.single = () => Promise.resolve(result)
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve)
  return { calls, chain }
}

/** Queues one builder per `from('notes')` call, in order. */
function queue(...results: { data: unknown; error: unknown }[]) {
  const all = results.map(builder)
  for (const { chain } of all) vi.mocked(supabase.from).mockReturnValueOnce(chain as never)
  return all.map(({ calls }) => calls)
}

const note: Note = {
  id: noteId,
  campaign_id: campaignId,
  author_id: 'author',
  visibility: 'private',
  title: 'Clues',
  body: 'text',
  character_id: null,
  updated_by: 'author',
  created_at: '2026-11-16T10:00:00+00:00',
  updated_at: '2026-11-16T10:00:00+00:00',
}
const values: NoteValues = { title: 'Clues', body: 'more text', character_id: null }
const createValues: NoteCreateValues = { ...values, visibility: 'campaign' }

beforeEach(() => {
  vi.mocked(supabase.from).mockReset()
})

describe('listNotes', () => {
  it('reads the campaign’s notes newest edit first, without bodies', async () => {
    const [calls] = queue({ data: [{ ...note, body: undefined }], error: null })
    const notes = await listNotes(campaignId)
    expect(supabase.from).toHaveBeenCalledWith('notes')
    expect(calls).toContainEqual(['eq', ['campaign_id', campaignId]])
    expect(calls).toContainEqual(['order', ['updated_at', { ascending: false }]])
    const fields = calls.find(([method]) => method === 'select')![1][0] as string
    expect(fields.split(',')).not.toContain('body')
    expect(notes).toHaveLength(1)
  })

  it('returns an empty list for no rows and throws on an error', async () => {
    queue({ data: null, error: null })
    await expect(listNotes(campaignId)).resolves.toEqual([])
    queue({ data: null, error: { message: 'boom' } })
    await expect(listNotes(campaignId)).rejects.toEqual({ message: 'boom' })
  })
})

describe('getNote', () => {
  it('reads one note with its body', async () => {
    const [calls] = queue({ data: note, error: null })
    await expect(getNote(noteId)).resolves.toEqual(note)
    expect(calls).toContainEqual(['eq', ['id', noteId]])
    const fields = calls.find(([method]) => method === 'select')![1][0] as string
    expect(fields.split(',')).toContain('body')
  })

  it('reports no row as unavailable and passes other errors through', async () => {
    queue({ data: null, error: null })
    await expect(getNote(noteId)).rejects.toThrow('note_unavailable')
    queue({ data: null, error: { message: 'boom' } })
    await expect(getNote(noteId)).rejects.toEqual({ message: 'boom' })
  })
})

describe('createNote', () => {
  it('inserts exactly the writable columns and returns the stored row', async () => {
    const [calls] = queue({ data: note, error: null })
    await expect(createNote(campaignId, createValues)).resolves.toEqual(note)
    expect(calls).toContainEqual([
      'insert',
      [
        {
          campaign_id: campaignId,
          visibility: 'campaign',
          title: 'Clues',
          body: 'more text',
          character_id: null,
        },
      ],
    ])
  })

  it('reports a row-level-security refusal as the campaign being unavailable', async () => {
    queue({ data: null, error: { code: '42501', message: 'new row violates row-level security' } })
    await expect(createNote(campaignId, createValues)).rejects.toThrow('note_campaign_unavailable')
  })

  it('passes the cap and link errors through', async () => {
    queue({ data: null, error: { code: 'P0001', message: 'note_limit_reached' } })
    await expect(createNote(campaignId, createValues)).rejects.toEqual({
      code: 'P0001',
      message: 'note_limit_reached',
    })
  })
})

describe('saveNote and setNoteVisibility', () => {
  it('saves only against the previous stamp', async () => {
    const [calls] = queue({ data: { ...note, body: 'more text' }, error: null })
    const saved = await saveNote(noteId, values, 'old-stamp')
    expect(saved.body).toBe('more text')
    expect(calls).toContainEqual(['update', [values]])
    expect(calls).toContainEqual(['eq', ['id', noteId]])
    expect(calls).toContainEqual(['eq', ['updated_at', 'old-stamp']])
    expect(supabase.from).toHaveBeenCalledTimes(1)
  })

  it('changes visibility alone, against the previous stamp', async () => {
    const [calls] = queue({ data: { ...note, visibility: 'campaign' }, error: null })
    await setNoteVisibility(noteId, 'campaign', 'old-stamp')
    expect(calls).toContainEqual(['update', [{ visibility: 'campaign' }]])
    expect(calls).toContainEqual(['eq', ['updated_at', 'old-stamp']])
  })

  it('re-reads on zero rows: a note that is still readable is a conflict carrying the latest', async () => {
    const latest = { ...note, body: 'someone else', updated_at: '2026-11-16T11:00:00+00:00' }
    queue({ data: null, error: null }, { data: latest, error: null })
    const failure = await saveNote(noteId, values, 'old-stamp').catch((error: unknown) => error)
    expect(isNoteConflict(failure)).toBe(true)
    expect((failure as NoteConflictError).latest).toEqual(latest)
    expect((failure as Error).message).toBe('note_conflict')
    expect(supabase.from).toHaveBeenCalledTimes(2)
  })

  it('re-reads on zero rows: a note that is gone is unavailable', async () => {
    queue({ data: null, error: null }, { data: null, error: null })
    await expect(saveNote(noteId, values, 'old-stamp')).rejects.toThrow('note_unavailable')
    queue({ data: null, error: null }, { data: null, error: null })
    await expect(setNoteVisibility(noteId, 'private', 'old-stamp')).rejects.toThrow(
      'note_unavailable',
    )
  })

  it('passes write errors through without re-reading', async () => {
    queue({ data: null, error: { code: '42501', message: 'note_visibility_author_only' } })
    await expect(setNoteVisibility(noteId, 'private', 'old-stamp')).rejects.toEqual({
      code: '42501',
      message: 'note_visibility_author_only',
    })
    expect(supabase.from).toHaveBeenCalledTimes(1)
  })
})

describe('deleteNote', () => {
  it('deletes by id and reports a missed row as unavailable', async () => {
    const [calls] = queue({ data: { id: noteId }, error: null })
    await expect(deleteNote(noteId)).resolves.toBeUndefined()
    expect(calls).toContainEqual(['delete', []])
    expect(calls).toContainEqual(['eq', ['id', noteId]])

    queue({ data: null, error: null })
    await expect(deleteNote(noteId)).rejects.toThrow('note_unavailable')
    queue({ data: null, error: { message: 'boom' } })
    await expect(deleteNote(noteId)).rejects.toEqual({ message: 'boom' })
  })
})

describe('error copy', () => {
  const fallback = 'Fallback copy.'

  it('maps each note code to its copy', () => {
    expect(noteError({ message: 'note_conflict' }, fallback)).toBe(
      'This note changed while you were editing. Your text is still here.',
    )
    expect(noteError(new Error('note_unavailable'), fallback)).toBe(
      'This note is no longer available. It may have been made private or deleted.',
    )
    expect(noteError({ message: 'note_campaign_unavailable' }, fallback)).toBe(
      'You can no longer add notes to this campaign.',
    )
    expect(noteError({ message: 'note_limit_reached' }, fallback)).toBe(
      'You can keep up to 500 notes in a campaign. Delete one to add another.',
    )
    expect(noteError({ message: 'note_character_unavailable' }, fallback)).toBe(
      'That character is no longer in this campaign. Choose another or remove the link.',
    )
  })

  it('uses the fallback for programming errors, checks, and anything unknown', () => {
    for (const error of [
      { message: 'note_visibility_author_only' },
      { message: 'note_reassignment_forbidden' },
      { code: '23514', message: 'new row violates check constraint "notes_title_check"' },
      new Error('network down'),
      null,
      'text',
    ]) {
      expect(noteError(error, fallback)).toBe(fallback)
    }
  })

  it('does not treat inherited object keys as codes', () => {
    expect(noteError({ message: 'toString' }, fallback)).toBe(fallback)
    expect(noteError({ message: 'constructor' }, fallback)).toBe(fallback)
  })

  it('classifies conflicts and unavailable notes', () => {
    expect(isNoteConflict(new NoteConflictError(note))).toBe(true)
    expect(isNoteConflict(new Error('note_conflict'))).toBe(false)
    expect(isNoteUnavailable(new Error('note_unavailable'))).toBe(true)
    expect(isNoteUnavailable({ message: 'note_campaign_unavailable' })).toBe(true)
    expect(isNoteUnavailable({ message: 'note_conflict' })).toBe(false)
  })
})
