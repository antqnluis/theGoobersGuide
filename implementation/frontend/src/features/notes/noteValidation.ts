import type { NoteCreateValues, NoteInput } from './noteTypes'

/** Mirrors the database CHECK constraints and the per-author cap (M03.4 plan §2.1, §5.2). */
export const noteLimits = {
  title: 120,
  body: 20_000,
  /** The body counter appears from this length. */
  bodyCounterFrom: 18_000,
  perAuthor: 500,
} as const

// eslint-disable-next-line no-control-regex
const titleControls = /[\u0000-\u001f\u007f-\u009f]/
// Newlines and tabs are allowed in the body; other control characters are not.
// eslint-disable-next-line no-control-regex
const bodyControls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/

export type NoteErrors = Partial<Record<'title' | 'body', string>>

const messages = {
  title: 'Enter a title of up to 120 characters.',
  body: 'Notes can be up to 20,000 characters.',
}

/** Line endings are stored as `\n`, so the count and the checks see what the database will. */
export function normalizeLineEndings(text: string) {
  return text.replace(/\r\n?/g, '\n')
}

/** Per-field errors for the note editor; an empty object means valid. */
export function validateNoteInput(input: Pick<NoteInput, 'title' | 'body'>): NoteErrors {
  const errors: NoteErrors = {}
  const title = input.title.trim()
  if (title.length < 1 || title.length > noteLimits.title || titleControls.test(title)) {
    errors.title = messages.title
  }
  const body = normalizeLineEndings(input.body)
  if (body.length > noteLimits.body || bodyControls.test(body)) errors.body = messages.body
  return errors
}

/** The characters left before the body limit, or null while the counter is hidden. */
export function bodyCharactersLeft(body: string) {
  const length = normalizeLineEndings(body).length
  return length >= noteLimits.bodyCounterFrom ? noteLimits.body - length : null
}

/** Trims the title and normalizes line endings; an empty body is stored as ''. */
export function normalizeNoteInput(input: NoteInput): NoteCreateValues {
  return {
    title: input.title.trim(),
    body: normalizeLineEndings(input.body),
    visibility: input.visibility,
    character_id: input.characterId,
  }
}
