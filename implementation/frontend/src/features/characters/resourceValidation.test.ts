import { describe, expect, it } from 'vitest'
import type { ResourceValues } from './characterTypes'
import {
  parseHpAmount,
  validateCondition,
  validateConcentration,
  validateResourceValues,
} from './resourceValidation'

const tracker: ResourceValues = {
  kind: 'tracker',
  name: 'Ki',
  slot_level: null,
  die: null,
  maximum: 4,
  current: 4,
  reset: 'short',
  position: 0,
}

describe('validateResourceValues', () => {
  it('accepts each kind', () => {
    expect(validateResourceValues(tracker)).toEqual({})
    expect(
      validateResourceValues({ ...tracker, kind: 'spell_slots', name: null, slot_level: 3 }),
    ).toEqual({})
    expect(
      validateResourceValues({
        ...tracker,
        kind: 'hit_dice',
        name: 'Fighter dice',
        die: 10,
        reset: 'none',
      }),
    ).toEqual({})
  })

  it('requires a name for a tracker and bounds it', () => {
    expect(validateResourceValues({ ...tracker, name: null }).name).toBeTruthy()
    expect(validateResourceValues({ ...tracker, name: '   ' }).name).toBeTruthy()
    expect(validateResourceValues({ ...tracker, name: 'x'.repeat(61) }).name).toBeTruthy()
    expect(validateResourceValues({ ...tracker, name: 'Bad\tname' }).name).toBeTruthy()
    expect(validateResourceValues({ ...tracker, name: 'x'.repeat(60) })).toEqual({})
  })

  it('needs a level for slots and a die size for hit dice, and a label stays optional', () => {
    const slots: ResourceValues = { ...tracker, kind: 'spell_slots', name: null, slot_level: 1 }
    expect(validateResourceValues({ ...slots, slot_level: null }).slot_level).toBeTruthy()
    expect(validateResourceValues({ ...slots, slot_level: 10 }).slot_level).toBeTruthy()
    expect(validateResourceValues({ ...slots, slot_level: 1.5 }).slot_level).toBeTruthy()
    expect(validateResourceValues({ ...slots, name: 'x'.repeat(61) }).name).toBeTruthy()
    const dice: ResourceValues = { ...tracker, kind: 'hit_dice', name: null, die: 8 }
    expect(validateResourceValues({ ...dice, die: 7 }).die).toBeTruthy()
    expect(validateResourceValues({ ...dice, die: null }).die).toBeTruthy()
  })

  it('bounds the maximum and keeps current within it', () => {
    expect(validateResourceValues({ ...tracker, maximum: 1000, current: 0 }).maximum).toBeTruthy()
    expect(validateResourceValues({ ...tracker, maximum: -1, current: 0 }).maximum).toBeTruthy()
    expect(validateResourceValues({ ...tracker, maximum: 1.5, current: 0 }).maximum).toBeTruthy()
    expect(validateResourceValues({ ...tracker, current: 5 }).current).toBeTruthy()
    expect(validateResourceValues({ ...tracker, current: -1 }).current).toBeTruthy()
    expect(validateResourceValues({ ...tracker, maximum: 999, current: 999 })).toEqual({})
    expect(validateResourceValues({ ...tracker, maximum: 0, current: 0 })).toEqual({})
  })

  it('rejects an unknown reset', () => {
    expect(validateResourceValues({ ...tracker, reset: 'dawn' as never }).reset).toBeTruthy()
  })
})

describe('validateCondition', () => {
  it('accepts a new condition and rejects blanks, long text, repeats, and a full list', () => {
    expect(validateCondition('Hexed by the Moon', ['prone'])).toBeNull()
    expect(validateCondition('   ', [])).toBeTruthy()
    expect(validateCondition('x'.repeat(41), [])).toBeTruthy()
    expect(validateCondition('x'.repeat(40), [])).toBeNull()
    expect(validateCondition('Bad\ttext', [])).toBeTruthy()
    expect(validateCondition('PRONE', ['prone'])).toMatch(/already/)
    expect(validateCondition('hexed', ['Hexed'])).toMatch(/already/)
    const full = Array.from({ length: 20 }, (_, i) => `c${i}`)
    expect(validateCondition('one more', full)).toMatch(/20/)
  })
})

describe('validateConcentration and parseHpAmount', () => {
  it('bounds the spell name; empty clears it', () => {
    expect(validateConcentration('')).toBeNull()
    expect(validateConcentration('Bless')).toBeNull()
    expect(validateConcentration('x'.repeat(81))).toBeTruthy()
    expect(validateConcentration('a\nb')).toBeTruthy()
  })

  it('reads a whole amount from 1 to 9,999', () => {
    expect(parseHpAmount(' 12 ')).toBe(12)
    expect(parseHpAmount('9999')).toBe(9999)
    for (const bad of ['', '0', '-3', '1.5', '10000', 'abc', '1e3', '12 3']) {
      expect(parseHpAmount(bad), bad).toBeNull()
    }
  })
})
