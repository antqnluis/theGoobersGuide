/** Shared plumbing for the two import document parsers (M03.8 §2). */

export const maxDocumentBytes = 1_000_000

export const documentFormats = {
  character: 'the-goobers-guide-character',
  update: 'the-goobers-guide-character-update',
} as const

export const characterDocumentVersion = 3
export const updateDocumentVersion = 2

export type JsonRead = { ok: true; value: unknown } | { ok: false; message: string }

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const fence = /^```[a-zA-Z]*\s*\n([\s\S]*?)\n?```$/

/**
 * Reads pasted or uploaded text as one JSON value. Outside writing assistants often wrap their
 * answer in a Markdown code fence, so a single surrounding fence is removed; nothing else is
 * interpreted. The text is never executed or rendered.
 */
export function readJsonDocument(text: string): JsonRead {
  if (new TextEncoder().encode(text).length >= maxDocumentBytes) {
    return { ok: false, message: 'This file is too large. Use a document under 1 MB.' }
  }
  let source = text.trim()
  if (source === '') return { ok: false, message: 'Paste a document first.' }
  const fenced = fence.exec(source)
  if (fenced) source = fenced[1].trim()
  try {
    return { ok: true, value: JSON.parse(source) as unknown }
  } catch {
    return {
      ok: false,
      message: 'That isn’t valid JSON. Paste the document exactly as the assistant returned it.',
    }
  }
}

export const regenerateCharacterMessage =
  'This document uses a different format version. Copy the current conversion prompt and generate the character document again.'
export const regenerateUpdateMessage =
  'This document uses a different format version. Copy the current update prompt and generate the update again.'

/**
 * Checks the envelope shared by both formats. Returns a message when the document must be
 * refused, or null when `format` and `version` match.
 */
export function checkEnvelope(
  value: unknown,
  expected: { format: string; version: number },
  regenerate: string,
): string | null {
  if (!isRecord(value)) return 'That isn’t a Goobers Guide document.'
  if (value.format === documentFormats.update && expected.format === documentFormats.character) {
    return 'This is an update document. Open the character and use Import updates.'
  }
  if (value.format === documentFormats.character && expected.format === documentFormats.update) {
    return 'This is a character document. Use Import character from the tent to create a new character.'
  }
  if (value.format !== expected.format) return 'That isn’t a Goobers Guide document.'
  if (value.version !== expected.version) return regenerate
  return null
}

// eslint-disable-next-line no-control-regex
export const controlCharacters = /[\u0000-\u001f\u007f-\u009f]/
