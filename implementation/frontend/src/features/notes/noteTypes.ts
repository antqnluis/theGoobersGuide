import type { Database } from '../../types/database'

type Tables = Database['public']['Tables']

export const noteVisibilities = ['private', 'campaign'] as const
export type NoteVisibility = (typeof noteVisibilities)[number]

/** One note with its body. `visibility` is narrowed from the column's text type. */
export type Note = Omit<Tables['notes']['Row'], 'visibility'> & { visibility: NoteVisibility }

/** A list row: everything but the body. */
export type NoteSummary = Omit<Note, 'body'>

/** A note as typed into the editor. */
export type NoteInput = {
  title: string
  body: string
  visibility: NoteVisibility
  characterId: string | null
}

/** The fields any editor may save: visibility is saved separately, by the author only. */
export type NoteValues = {
  title: string
  body: string
  character_id: string | null
}

/** What a new note is created with. */
export type NoteCreateValues = NoteValues & { visibility: NoteVisibility }
