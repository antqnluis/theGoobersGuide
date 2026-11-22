import { describe, expect, it } from 'vitest'
import {
  bodyCharactersLeft,
  noteLimits,
  normalizeLineEndings,
  normalizeNoteInput,
  validateNoteInput,
} from './noteValidation'

describe('validateNoteInput', () => {
  it('accepts a title and a body at their limits, and an empty body', () => {
    expect(validateNoteInput({ title: 'x', body: '' })).toEqual({})
    expect(validateNoteInput({ title: 'x'.repeat(120), body: 'y'.repeat(20_000) })).toEqual({})
  })

  it('requires a trimmed title of 1 to 120 characters without control characters', () => {
    for (const title of ['', '   ', 'x'.repeat(121), 'tab\there', 'line\nbreak', 'bell\u0007']) {
      expect(validateNoteInput({ title, body: '' }).title, JSON.stringify(title)).toBeTruthy()
    }
    // Surrounding spaces are trimmed, not refused, and the limit counts the trimmed title.
    expect(validateNoteInput({ title: `  ${'x'.repeat(120)}  `, body: '' })).toEqual({})
  })

  it('bounds the body and allows newlines and tabs only', () => {
    expect(validateNoteInput({ title: 'x', body: 'z'.repeat(20_001) }).body).toBeTruthy()
    expect(validateNoteInput({ title: 'x', body: 'bell\u0007' }).body).toBeTruthy()
    expect(validateNoteInput({ title: 'x', body: 'nul\u007f' }).body).toBeTruthy()
    expect(validateNoteInput({ title: 'x', body: 'one\n\ttwo\r\nthree' })).toEqual({})
  })

  it('counts a body after line endings are normalized, as the database stores it', () => {
    // Each CRLF is one character once normalized to LF: 20,000 pairs are exactly the limit.
    expect(validateNoteInput({ title: 'x', body: '\r\n'.repeat(20_000) })).toEqual({})
    expect(validateNoteInput({ title: 'x', body: `${'\r\n'.repeat(20_000)}y` }).body).toBeTruthy()
  })

  it('reports both fields at once', () => {
    expect(Object.keys(validateNoteInput({ title: '', body: 'z'.repeat(20_001) }))).toEqual([
      'title',
      'body',
    ])
  })
})

describe('bodyCharactersLeft', () => {
  it('stays hidden until 18,000 characters, then counts down to the limit', () => {
    expect(bodyCharactersLeft('x'.repeat(17_999))).toBeNull()
    expect(bodyCharactersLeft('x'.repeat(noteLimits.bodyCounterFrom))).toBe(2_000)
    expect(bodyCharactersLeft('x'.repeat(20_000))).toBe(0)
    expect(bodyCharactersLeft('x'.repeat(20_050))).toBe(-50)
  })
})

describe('normalizeNoteInput', () => {
  it('trims the title, normalizes line endings, and maps the link', () => {
    expect(
      normalizeNoteInput({
        title: '  Clues  ',
        body: 'a\r\nb\rc',
        visibility: 'campaign',
        characterId: 'c1',
      }),
    ).toEqual({ title: 'Clues', body: 'a\nb\nc', visibility: 'campaign', character_id: 'c1' })
  })

  it('stores an empty body as an empty string and no link as null', () => {
    expect(
      normalizeNoteInput({ title: 'T', body: '', visibility: 'private', characterId: null }),
    ).toEqual({ title: 'T', body: '', visibility: 'private', character_id: null })
  })

  it('keeps body whitespace as typed', () => {
    expect(normalizeLineEndings('  keep  \n')).toBe('  keep  \n')
  })
})
