import type { NpcCreateValues, NpcInput } from './npcTypes'

/** Mirrors the database CHECK constraints and the per-author cap. */
export const npcLimits = {
  name: 120,
  role: 120,
  location: 120,
  body: 20_000,
  /** The body counter appears from this length. */
  bodyCounterFrom: 18_000,
  perAuthor: 500,
} as const

// eslint-disable-next-line no-control-regex
const lineControls = /[\u0000-\u001f\u007f-\u009f]/
// Newlines and tabs are allowed in the body; other control characters are not.
// eslint-disable-next-line no-control-regex
const bodyControls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/

export type NpcErrors = Partial<Record<'name' | 'role' | 'location' | 'body', string>>

const messages = {
  name: 'Enter a name of up to 120 characters.',
  role: 'Who they are can be up to 120 characters.',
  location: 'Where you met them can be up to 120 characters.',
  body: 'What you know can be up to 20,000 characters.',
}

/** Line endings are stored as `\n`, so the count and the checks see what the database will. */
export function normalizeLineEndings(text: string) {
  return text.replace(/\r\n?/g, '\n')
}

/** Per-field errors for the NPC editor; an empty object means valid. */
export function validateNpcInput(
  input: Pick<NpcInput, 'name' | 'role' | 'location' | 'body'>,
): NpcErrors {
  const errors: NpcErrors = {}
  const name = input.name.trim()
  if (name.length < 1 || name.length > npcLimits.name || lineControls.test(name)) {
    errors.name = messages.name
  }
  for (const field of ['role', 'location'] as const) {
    const value = input[field].trim()
    if (value.length > npcLimits[field] || lineControls.test(value)) errors[field] = messages[field]
  }
  const body = normalizeLineEndings(input.body)
  if (body.length > npcLimits.body || bodyControls.test(body)) errors.body = messages.body
  return errors
}

/** The characters left before the body limit, or null while the counter is hidden. */
export function bodyCharactersLeft(body: string) {
  const length = normalizeLineEndings(body).length
  return length >= npcLimits.bodyCounterFrom ? npcLimits.body - length : null
}

/** Trims the short fields and normalizes line endings; an empty body is stored as ''. */
export function normalizeNpcInput(input: NpcInput): NpcCreateValues {
  return {
    name: input.name.trim(),
    role: input.role.trim(),
    location: input.location.trim(),
    body: normalizeLineEndings(input.body),
    visibility: input.visibility,
  }
}
