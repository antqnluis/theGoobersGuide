import { describe, expect, it } from 'vitest'
import { bodyCharactersLeft, normalizeNpcInput, npcLimits, validateNpcInput } from './npcValidation'

const valid = { name: 'Brenna', role: '', location: '', body: '' }

describe('validateNpcInput', () => {
  it('accepts every field at its limit, and empty optional fields', () => {
    expect(validateNpcInput(valid)).toEqual({})
    expect(
      validateNpcInput({
        name: 'x'.repeat(120),
        role: 'y'.repeat(120),
        location: 'z'.repeat(120),
        body: 'b'.repeat(20_000),
      }),
    ).toEqual({})
  })

  it('requires a trimmed name of 1 to 120 characters without control characters', () => {
    for (const name of ['', '   ', 'x'.repeat(121), 'tab\there', 'line\nbreak']) {
      expect(validateNpcInput({ ...valid, name }).name, JSON.stringify(name)).toBeTruthy()
    }
    expect(validateNpcInput({ ...valid, name: `  ${'x'.repeat(120)}  ` })).toEqual({})
  })

  it('bounds the role and location', () => {
    expect(validateNpcInput({ ...valid, role: 'x'.repeat(121) }).role).toBeTruthy()
    expect(validateNpcInput({ ...valid, location: 'x\ny' }).location).toBeTruthy()
  })

  it('bounds the body and allows newlines and tabs only', () => {
    expect(validateNpcInput({ ...valid, body: 'z'.repeat(20_001) }).body).toBeTruthy()
    expect(validateNpcInput({ ...valid, body: 'bell\u0007' }).body).toBeTruthy()
    expect(validateNpcInput({ ...valid, body: 'one\n\ttwo\r\nthree' })).toEqual({})
  })
})

describe('bodyCharactersLeft', () => {
  it('stays hidden until 18,000 characters, then counts down', () => {
    expect(bodyCharactersLeft('x'.repeat(17_999))).toBeNull()
    expect(bodyCharactersLeft('x'.repeat(npcLimits.bodyCounterFrom))).toBe(2_000)
    expect(bodyCharactersLeft('x'.repeat(20_050))).toBe(-50)
  })
})

describe('normalizeNpcInput', () => {
  it('trims short fields and normalizes line endings', () => {
    expect(
      normalizeNpcInput({
        name: '  Brenna ',
        role: ' Innkeeper ',
        location: ' ',
        body: 'a\r\nb',
        visibility: 'campaign',
      }),
    ).toEqual({
      name: 'Brenna',
      role: 'Innkeeper',
      location: '',
      body: 'a\nb',
      visibility: 'campaign',
    })
  })
})
