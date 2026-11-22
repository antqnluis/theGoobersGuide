/** Shared plumbing for the two import document parsers (M03.8 §2). */

export const maxDocumentBytes = 1_000_000

export const documentFormats = {
  character: 'the-goobers-guide-character',
  update: 'the-goobers-guide-character-update',
  handoff: 'the-goobers-guide-adventure-handoff',
} as const

export const characterDocumentVersion = 3
export const updateDocumentVersion = 2
export const handoffDocumentVersion = 1

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
export const regenerateHandoffMessage =
  'This document uses a different format version. Copy the current handoff prompt and generate the proposal again.'

/**
 * What to say when a document is a known Goobers Guide format, but not the one being read:
 * expected format -> found format -> message. A format that is not listed gets the generic
 * "isn't a Goobers Guide document" refusal.
 */
export type WrongFormatMessages = Readonly<Record<string, Readonly<Record<string, string>>>>

export const wrongFormatMessages: WrongFormatMessages = {
  [documentFormats.character]: {
    [documentFormats.update]:
      'This is an update document. Open the character and use Import updates.',
    [documentFormats.handoff]:
      'This is an adventure handoff. Open the adventure and use Import handoff, or start one from the map table.',
  },
  [documentFormats.update]: {
    [documentFormats.character]:
      'This is a character document. Use Import character from the tent to create a new character.',
    [documentFormats.handoff]:
      'This is an adventure handoff. Open the adventure and use Import handoff, or start one from the map table.',
  },
  [documentFormats.handoff]: {
    [documentFormats.character]:
      'This is a character document. Use Import character from the tent to create a new character.',
    [documentFormats.update]:
      'This is a character update. Open the character and use Import updates.',
  },
}

/**
 * Checks the envelope shared by every format. Returns a message when the document must be
 * refused, or null when `format` and `version` match.
 */
export function checkEnvelope(
  value: unknown,
  expected: { format: string; version: number },
  regenerate: string,
  wrongFormat: WrongFormatMessages = wrongFormatMessages,
): string | null {
  if (!isRecord(value)) return 'That isn’t a Goobers Guide document.'
  if (value.format !== expected.format) {
    const known =
      typeof value.format === 'string' ? wrongFormat[expected.format]?.[value.format] : undefined
    return known ?? 'That isn’t a Goobers Guide document.'
  }
  if (value.version !== expected.version) return regenerate
  return null
}

// eslint-disable-next-line no-control-regex
export const controlCharacters = /[\u0000-\u001f\u007f-\u009f]/
