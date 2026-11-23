import { describe, expect, it } from 'vitest'
import type { CharacterItemInput } from './characterTypes'
import { normalizeItemInput, parseCoinInput, validateItemInput } from './inventoryValidation'

const valid: CharacterItemInput = {
  name: 'Rope',
  quantity: 1,
  weight: '',
  description: '',
  equipped: false,
  attuned: false,
}
const check = (overrides: Partial<CharacterItemInput>) =>
  validateItemInput({ ...valid, ...overrides })

describe('validateItemInput', () => {
  it('accepts a bare name and the boundaries', () => {
    expect(check({})).toEqual({})
    expect(
      check({
        name: 'x'.repeat(80),
        quantity: 9999,
        weight: '99999.99',
        description: 'd'.repeat(2000),
      }),
    ).toEqual({})
    expect(check({ quantity: 0, weight: '0' })).toEqual({})
    expect(check({ weight: '.5' })).toEqual({})
  })

  it.each([
    ['empty', ''],
    ['blank', '   '],
    ['too long', 'x'.repeat(81)],
    ['a control character', 'tab\there'],
  ])('rejects a name that is %s', (_label, name) => {
    expect(check({ name }).name).toBe('Enter a name of up to 80 characters.')
  })

  it('trims the name before measuring it', () => {
    expect(check({ name: `  ${'x'.repeat(80)}  ` })).toEqual({})
  })

  it.each([-1, 10_000, 1.5, Number.NaN])('rejects quantity %s', (quantity) => {
    expect(check({ quantity }).quantity).toBe('Quantity must be a whole number from 0 to 9,999.')
  })

  it.each(['-1', '100000', '99999.999', '1.234', 'abc', '1e3', '.', '1,5', '1 2', '7.'])(
    'rejects weight %s',
    (weight) => {
      expect(check({ weight }).weight).toMatch(/^Weight must be/)
    },
  )

  it('allows newlines and tabs in descriptions but not other control characters', () => {
    expect(check({ description: 'Line one\nLine two\tend' })).toEqual({})
    expect(check({ description: 'bell\u0007' }).description).toBe(
      'Descriptions can be up to 2,000 characters.',
    )
    expect(check({ description: 'x'.repeat(2001) }).description).toBeDefined()
  })

  it('reports every field at once', () => {
    expect(
      Object.keys(check({ name: '', quantity: -1, weight: 'x', description: 'x'.repeat(2001) })),
    ).toEqual(['name', 'quantity', 'weight', 'description'])
  })
})

describe('normalizeItemInput', () => {
  it('passes the rarity through, and leaves it out when an import has none', () => {
    expect(normalizeItemInput({ ...valid, rarity: 'rare' }).rarity).toBe('rare')
    expect(normalizeItemInput(valid).rarity).toBeUndefined()
  })

  it('trims text and stores empty weight and description as null', () => {
    expect(
      normalizeItemInput({ ...valid, name: '  Rope  ', weight: ' ', description: '  \n ' }),
    ).toEqual({
      name: 'Rope',
      quantity: 1,
      weight: null,
      description: null,
      equipped: false,
      attuned: false,
    })
  })

  it('parses the weight and keeps the flags', () => {
    expect(
      normalizeItemInput({
        ...valid,
        weight: '0.25',
        description: ' Silver ',
        equipped: true,
        attuned: true,
        quantity: 0,
      }),
    ).toEqual({
      name: 'Rope',
      quantity: 0,
      weight: 0.25,
      description: 'Silver',
      equipped: true,
      attuned: true,
    })
  })
})

describe('parseCoinInput', () => {
  it('reads whole numbers, with blanks as zero', () => {
    const { amounts, errors } = parseCoinInput({ gp: '5', sp: ' 12 ', cp: '' })
    expect(errors).toEqual({})
    expect(amounts).toEqual({ cp: 0, sp: 12, gp: 5 })
  })

  it('accepts the upper limit', () => {
    expect(parseCoinInput({ gp: '9999999' }).errors).toEqual({})
  })

  it.each(['-1', '1.5', 'abc', '10000000', '99999999', '1e3', '0x10'])('rejects %s', (text) => {
    expect(parseCoinInput({ gp: text }).errors.gp).toBe('Enter a whole number up to 9,999,999.')
  })

  it('needs at least one non-zero amount', () => {
    for (const input of [{}, { gp: '' }, { gp: '0', sp: '0' }]) {
      expect(parseCoinInput(input).errors).toEqual({
        form: 'Enter an amount for at least one coin.',
      })
    }
  })

  it('does not add the form error when a field is already wrong', () => {
    expect(parseCoinInput({ gp: 'x' }).errors).toEqual({
      gp: 'Enter a whole number up to 9,999,999.',
    })
  })
})
