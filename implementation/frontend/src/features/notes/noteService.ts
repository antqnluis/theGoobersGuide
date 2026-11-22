import { supabase } from '../../lib/supabase'
import { readErrorMessage } from '../campaigns/rpcErrors'
import type { Note, NoteCreateValues, NoteSummary, NoteValues, NoteVisibility } from './noteTypes'

const summaryFields =
  'id,campaign_id,author_id,visibility,title,character_id,updated_by,created_at,updated_at'
const noteFields = `${summaryFields},body`

/** A save that matched no row because the note changed since it was read; carries the latest. */
export class NoteConflictError extends Error {
  readonly latest: Note

  constructor(latest: Note) {
    super('note_conflict')
    this.name = 'NoteConflictError'
    this.latest = latest
  }
}

function unavailable() {
  return new Error('note_unavailable')
}

/** Every note the member may read in the campaign, newest edit first. Bodies are left out. */
export async function listNotes(campaignId: string): Promise<NoteSummary[]> {
  const { data, error } = await supabase
    .from('notes')
    .select(summaryFields)
    .eq('campaign_id', campaignId)
    .order('updated_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as NoteSummary[]
}

/** One note with its body. No row means it was deleted, made private, or the member left. */
export async function getNote(noteId: string): Promise<Note> {
  const { data, error } = await supabase
    .from('notes')
    .select(noteFields)
    .eq('id', noteId)
    .maybeSingle()

  if (error) throw error
  if (!data) throw unavailable()
  return data as Note
}

export async function createNote(campaignId: string, values: NoteCreateValues) {
  const { data, error } = await supabase
    .from('notes')
    .insert({
      campaign_id: campaignId,
      visibility: values.visibility,
      title: values.title,
      body: values.body,
      character_id: values.character_id,
    })
    .select(noteFields)
    .single()

  if (error) {
    // Row-level security refused the insert: no longer a member of the campaign.
    if (error.code === '42501') throw new Error('note_campaign_unavailable')
    throw error
  }
  return data as Note
}

/**
 * Applies a change only if nobody wrote the note since `previousUpdatedAt`. Zero rows means the
 * note changed (a conflict, with the latest version attached) or is gone (unavailable).
 */
async function writeNote(
  noteId: string,
  patch: Partial<NoteValues> & { visibility?: NoteVisibility },
  previousUpdatedAt: string,
): Promise<Note> {
  const { data, error } = await supabase
    .from('notes')
    .update(patch)
    .eq('id', noteId)
    .eq('updated_at', previousUpdatedAt)
    .select(noteFields)
    .maybeSingle()

  if (error) throw error
  if (data) return data as Note

  // Tell a stale save from a note that is no longer readable.
  const latest = await getNote(noteId)
  throw new NoteConflictError(latest)
}

/** Saves the title, body, and link. */
export function saveNote(noteId: string, values: NoteValues, previousUpdatedAt: string) {
  return writeNote(noteId, values, previousUpdatedAt)
}

/** Shares a note with the campaign or makes it private. Only the author may. */
export function setNoteVisibility(
  noteId: string,
  visibility: NoteVisibility,
  previousUpdatedAt: string,
) {
  return writeNote(noteId, { visibility }, previousUpdatedAt)
}

export async function deleteNote(noteId: string) {
  const { data, error } = await supabase
    .from('notes')
    .delete()
    .eq('id', noteId)
    .select('id')
    .maybeSingle()

  if (error) throw error
  if (!data) throw unavailable()
}

const noteErrors: Record<string, string> = {
  note_conflict: 'This note changed while you were editing. Your text is still here.',
  note_unavailable: 'This note is no longer available. It may have been made private or deleted.',
  note_campaign_unavailable: 'You can no longer add notes to this campaign.',
  note_limit_reached: 'You can keep up to 500 notes in a campaign. Delete one to add another.',
  note_character_unavailable:
    'That character is no longer in this campaign. Choose another or remove the link.',
}

/** Safe copy for a note failure; anything unknown gets the caller's fallback. */
export function noteError(error: unknown, fallback: string) {
  const message = readErrorMessage(error)
  return Object.hasOwn(noteErrors, message) ? noteErrors[message] : fallback
}

export function isNoteConflict(error: unknown): error is NoteConflictError {
  return error instanceof NoteConflictError
}

/** The note was deleted, made private, or the member left: its text can no longer be saved. */
export function isNoteUnavailable(error: unknown) {
  const message = readErrorMessage(error)
  return message === 'note_unavailable' || message === 'note_campaign_unavailable'
}
