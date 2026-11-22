import { describe, expect, it } from 'vitest'
import {
  characterDocumentVersion,
  checkEnvelope,
  documentFormats,
  handoffDocumentVersion,
  readJsonDocument,
  regenerateCharacterMessage,
  regenerateHandoffMessage,
  regenerateUpdateMessage,
  updateDocumentVersion,
} from './importText'

const character = { format: documentFormats.character, version: characterDocumentVersion }
const update = { format: documentFormats.update, version: updateDocumentVersion }
const handoff = { format: documentFormats.handoff, version: handoffDocumentVersion }

describe('checkEnvelope', () => {
  it('accepts a matching format and version for each format', () => {
    expect(checkEnvelope(character, character, regenerateCharacterMessage)).toBeNull()
    expect(checkEnvelope(update, update, regenerateUpdateMessage)).toBeNull()
    expect(checkEnvelope(handoff, handoff, regenerateHandoffMessage)).toBeNull()
  })

  it('asks for a fresh document when the version differs', () => {
    expect(checkEnvelope({ ...handoff, version: 2 }, handoff, regenerateHandoffMessage)).toBe(
      regenerateHandoffMessage,
    )
    expect(checkEnvelope({ ...character, version: 1 }, character, regenerateCharacterMessage)).toBe(
      regenerateCharacterMessage,
    )
  })

  it('points character documents and updates at the right place (unchanged behaviour)', () => {
    expect(checkEnvelope(update, character, regenerateCharacterMessage)).toContain('Import updates')
    expect(checkEnvelope(character, update, regenerateUpdateMessage)).toContain('Import character')
  })

  it('points a handoff at the adventure, and other documents at their own import', () => {
    expect(checkEnvelope(handoff, character, regenerateCharacterMessage)).toContain(
      'adventure handoff',
    )
    expect(checkEnvelope(handoff, update, regenerateUpdateMessage)).toContain('adventure handoff')
    expect(checkEnvelope(character, handoff, regenerateHandoffMessage)).toContain(
      'Import character',
    )
    expect(checkEnvelope(update, handoff, regenerateHandoffMessage)).toContain('Import updates')
  })

  it('refuses anything else as not a Goobers Guide document', () => {
    const generic = 'That isn’t a Goobers Guide document.'
    for (const value of [null, 'text', 4, [], {}, { format: 'other', version: 1 }]) {
      expect(checkEnvelope(value, handoff, regenerateHandoffMessage)).toBe(generic)
    }
    expect(checkEnvelope({ format: 7, version: 1 }, handoff, regenerateHandoffMessage)).toBe(
      generic,
    )
  })

  it('takes the wrong-format messages as an argument', () => {
    expect(
      checkEnvelope(update, character, regenerateCharacterMessage, {
        [documentFormats.character]: { [documentFormats.update]: 'Custom.' },
      }),
    ).toBe('Custom.')
  })
})

describe('readJsonDocument', () => {
  it('strips one code fence and refuses empty, oversized, and invalid text', () => {
    expect(readJsonDocument('```json\n{"a":1}\n```')).toEqual({ ok: true, value: { a: 1 } })
    expect(readJsonDocument('  ')).toMatchObject({ ok: false })
    expect(readJsonDocument('{nope')).toMatchObject({ ok: false })
    expect(readJsonDocument(`"${'x'.repeat(1_000_000)}"`)).toMatchObject({ ok: false })
  })
})
