import { describe, expect, it } from 'vitest'
import { formatSpec } from '../dice/diceNotation'
import type { CharacterResource } from './characterTypes'
import {
  concentrationDc,
  conditionLabel,
  conditionReminder,
  deathSaveOutcome,
  groupResources,
  hitDieHealing,
  hitDieRoll,
  hitDieSheetRoll,
  hpAfter,
  isEmptyRestPlan,
  normalizeCondition,
  ordinal,
  resourceLabel,
  restPreview,
  suggestHitDice,
  suggestSpellSlots,
} from './resourceRules'

let counter = 0
function resource(overrides: Partial<CharacterResource> = {}): CharacterResource {
  counter += 1
  return {
    id: `r${counter}`,
    character_id: 'c1',
    kind: 'tracker',
    name: 'Ki',
    slot_level: null,
    die: null,
    maximum: 4,
    current: 1,
    reset: 'short',
    position: counter,
    created_at: `2026-11-24T10:00:0${counter % 10}+00:00`,
    updated_at: '2026-11-24T10:00:00+00:00',
    ...overrides,
  }
}
const slots = (level: number, overrides: Partial<CharacterResource> = {}) =>
  resource({ kind: 'spell_slots', name: null, slot_level: level, reset: 'long', ...overrides })
const hitDice = (die: number, overrides: Partial<CharacterResource> = {}) =>
  resource({ kind: 'hit_dice', name: null, die, reset: 'long', ...overrides })

const hurt = {
  max_hp: 30,
  current_hp: 12,
  temp_hp: 5,
  exhaustion: 2,
  death_save_successes: 1,
  death_save_failures: 2,
}

describe('restPreview', () => {
  it('a long rest restores HP, trackers, exhaustion, and death saves', () => {
    const ki = resource({ id: 'ki', reset: 'short' })
    const rage = resource({ id: 'rage', reset: 'long', maximum: 3, current: 0 })
    const manual = resource({ id: 'manual', reset: 'none' })
    const full = resource({ id: 'full', reset: 'long', maximum: 2, current: 2 })
    const plan = restPreview(hurt, [ki, rage, manual, full], 'long')
    expect(plan).toEqual({
      hp: 'max',
      temp_hp: 0,
      exhaustion: -1,
      clear_death_saves: true,
      resources: [
        { id: 'ki', current: 4 },
        { id: 'rage', current: 3 },
      ],
    })
  })

  it('a short rest refills only short trackers and touches nothing else', () => {
    const ki = resource({ id: 'ki', reset: 'short' })
    const rage = resource({ id: 'rage', reset: 'long' })
    const dice = hitDice(8, { id: 'hd', maximum: 4, current: 0 })
    expect(restPreview(hurt, [ki, rage, dice], 'short')).toEqual({
      resources: [{ id: 'ki', current: 4 }],
    })
  })

  it('leaves out what is already full or unset', () => {
    const sheet = {
      max_hp: null,
      current_hp: null,
      temp_hp: 0,
      exhaustion: 0,
      death_save_successes: 0,
      death_save_failures: 0,
    }
    const plan = restPreview(sheet, [resource({ current: 4 })], 'long')
    expect(plan).toEqual({})
    expect(isEmptyRestPlan(plan)).toBe(true)
    expect(restPreview({ ...sheet, max_hp: 10, current_hp: 10 }, [], 'long')).toEqual({})
    expect(restPreview({ ...sheet, max_hp: 10, current_hp: null }, [], 'long')).toEqual({
      hp: 'max',
    })
  })

  it('gives back half the hit dice, at least one, largest dice first', () => {
    const d10 = hitDice(10, { id: 'd10', maximum: 3, current: 0 })
    const d8 = hitDice(8, { id: 'd8', maximum: 3, current: 0 })
    // Total 6, so 3 come back: all of the d10s.
    expect(restPreview(hurt, [d8, d10], 'long').resources).toEqual([{ id: 'd10', current: 3 }])

    const one = hitDice(8, { id: 'one', maximum: 1, current: 0 })
    expect(restPreview(hurt, [one], 'long').resources).toEqual([{ id: 'one', current: 1 }])

    // Spill over to the next die when the first is nearly full.
    const near = hitDice(10, { id: 'near', maximum: 4, current: 3 })
    const spare = hitDice(8, { id: 'spare', maximum: 4, current: 0 })
    expect(restPreview(hurt, [near, spare], 'long').resources).toEqual([
      { id: 'near', current: 4 },
      { id: 'spare', current: 3 },
    ])
    expect(restPreview(hurt, [hitDice(8, { maximum: 3, current: 3 })], 'long').resources).toBe(
      undefined,
    )
    expect(
      restPreview(hurt, [hitDice(8, { maximum: 4, current: 0, reset: 'none' })], 'long').resources,
    ).toBe(undefined)
  })
})

describe('concentration and death saves', () => {
  it('the save DC is 10 or half the damage, whichever is higher', () => {
    expect(concentrationDc(1)).toBe(10)
    expect(concentrationDc(21)).toBe(10)
    expect(concentrationDc(22)).toBe(11)
    expect(concentrationDc(45)).toBe(22)
  })

  it('reads a natural d20 as a death save', () => {
    expect(deathSaveOutcome(20)).toBe('critical_success')
    expect(deathSaveOutcome(10)).toBe('success')
    expect(deathSaveOutcome(9)).toBe('failure')
    expect(deathSaveOutcome(2)).toBe('failure')
    expect(deathSaveOutcome(1)).toBe('critical_failure')
  })
})

describe('hit dice rolls', () => {
  it('rolls one die plus the Constitution modifier', () => {
    expect(formatSpec(hitDieRoll(8, 2))).toBe('1d8 + 2')
    expect(formatSpec(hitDieRoll(10, -1))).toBe('1d10 - 1')
    expect(formatSpec(hitDieRoll(6, 0))).toBe('1d6')
    expect(hitDieSheetRoll(8, 1, 'c1')).toMatchObject({ label: 'Hit die', characterId: 'c1' })
  })

  it('never heals below zero', () => {
    expect(hitDieHealing(-1)).toBe(0)
    expect(hitDieHealing(7)).toBe(7)
  })
})

describe('hpAfter (the same rules as apply_character_hp)', () => {
  const state = {
    max_hp: 20,
    current_hp: 15,
    temp_hp: 3,
    death_save_successes: 0,
    death_save_failures: 0,
  }

  it('damage takes temp HP first', () => {
    expect(hpAfter(state, 'damage', 2)).toMatchObject({
      current_hp: 15,
      temp_hp: 1,
      damage_taken: 0,
    })
    expect(hpAfter(state, 'damage', 10)).toMatchObject({
      current_hp: 8,
      temp_hp: 0,
      damage_taken: 7,
    })
    expect(hpAfter(state, 'damage', 99)).toMatchObject({ current_hp: 0, damage_taken: 96 })
  })

  it('damage at 0 HP adds a failure only when it gets past temp HP', () => {
    const down = { ...state, current_hp: 0, temp_hp: 0, death_save_failures: 2 }
    expect(hpAfter(down, 'damage', 1)).toMatchObject({ death_save_failures: 3 })
    expect(hpAfter({ ...down, death_save_failures: 3 }, 'damage', 1)).toMatchObject({
      death_save_failures: 3,
    })
    expect(hpAfter({ ...down, temp_hp: 5 }, 'damage', 4)).toMatchObject({
      death_save_failures: 2,
      temp_hp: 1,
    })
  })

  it('healing caps at max HP and revives from 0, clearing saves', () => {
    expect(hpAfter(state, 'heal', 99)?.current_hp).toBe(20)
    const down = { ...state, current_hp: 0, death_save_successes: 2, death_save_failures: 1 }
    expect(hpAfter(down, 'heal', 3)).toMatchObject({
      current_hp: 3,
      death_save_successes: 0,
      death_save_failures: 0,
    })
  })

  it('temporary HP keep the larger pool', () => {
    expect(hpAfter(state, 'temp', 2)?.temp_hp).toBe(3)
    expect(hpAfter(state, 'temp', 8)?.temp_hp).toBe(8)
  })

  it('does nothing for damage or healing until HP is set, but temp HP still work', () => {
    const unset = { ...state, max_hp: null, current_hp: null }
    expect(hpAfter(unset, 'damage', 1)).toBeNull()
    expect(hpAfter(unset, 'heal', 1)).toBeNull()
    expect(hpAfter(unset, 'temp', 6)).toMatchObject({ temp_hp: 6, current_hp: null })
  })
})

describe('labels and groups', () => {
  it('names each kind', () => {
    expect(resourceLabel(slots(1))).toBe('1st level slots')
    expect(resourceLabel(slots(3, { name: 'Pact slots' }))).toBe('Pact slots (3rd level)')
    expect(resourceLabel(hitDice(8))).toBe('d8 hit dice')
    expect(resourceLabel(resource({ name: 'Lay on Hands' }))).toBe('Lay on Hands')
    expect([1, 2, 3, 4, 11, 12, 13, 21].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
    ])
  })

  it('groups and orders trackers', () => {
    const a = slots(3, { id: 'a' })
    const b = slots(1, { id: 'b' })
    const c = hitDice(8, { id: 'c' })
    const d = hitDice(10, { id: 'd' })
    const e = resource({ id: 'e', position: 2 })
    const f = resource({ id: 'f', position: 1 })
    const groups = groupResources([a, b, c, d, e, f])
    expect(groups.spellSlots.map((row) => row.id)).toEqual(['b', 'a'])
    expect(groups.hitDice.map((row) => row.id)).toEqual(['d', 'c'])
    expect(groups.features.map((row) => row.id)).toEqual(['f', 'e'])
  })
})

describe('conditions', () => {
  it('stores a standard condition by key and a custom one as typed', () => {
    expect(normalizeCondition('  Prone ')).toBe('prone')
    expect(normalizeCondition('Hexed by the Moon')).toBe('Hexed by the Moon')
    expect(conditionLabel('prone')).toBe('Prone')
    expect(conditionLabel('Hexed by the Moon')).toBe('Hexed by the Moon')
    expect(conditionReminder('prone')).toMatch(/disadvantage/i)
    expect(conditionReminder('Hexed by the Moon')).toBeNull()
  })
})

describe('suggestions', () => {
  const spells = `Cantrips: Fire Bolt
1st level (4 slots): Shield, Magic Missile
2nd level (3 slots): Misty Step
3rd level (2 slots): Fireball
4th level: Banishment`

  it('suggests slots from headings that state a count', () => {
    const found = suggestSpellSlots(spells, [])
    expect(found.map((entry) => [entry.values.slot_level, entry.values.maximum])).toEqual([
      [1, 4],
      [2, 3],
      [3, 2],
    ])
    expect(found[0].values).toMatchObject({
      kind: 'spell_slots',
      name: null,
      current: 4,
      reset: 'long',
    })
  })

  it('does not repeat a level that is tracked, but pact slots do not count', () => {
    const found = suggestSpellSlots(spells, [slots(1), slots(2, { name: 'Pact slots' })])
    expect(found.map((entry) => entry.values.slot_level)).toEqual([2, 3])
  })

  it('suggests nothing without a count, a level, or spells', () => {
    expect(suggestSpellSlots('', [])).toEqual([])
    expect(suggestSpellSlots('Cantrips (2 slots): Light', [])).toEqual([])
    expect(suggestSpellSlots('1st level (0 slots): Shield', [])).toEqual([])
  })

  it('suggests hit dice from a recognised single class and the level', () => {
    expect(suggestHitDice('Fighter', 5, [])[0].values).toMatchObject({
      kind: 'hit_dice',
      die: 10,
      maximum: 5,
      current: 5,
      reset: 'long',
    })
    expect(suggestHitDice(' wizard ', 1, [])[0].label).toBe('1 d6 hit die')
    expect(suggestHitDice('Barbarian', 20, [])[0].values.die).toBe(12)
  })

  it('does not guess for unknown or combined classes, or when the die is tracked', () => {
    expect(suggestHitDice('Fighter / Wizard', 5, [])).toEqual([])
    expect(suggestHitDice('Blood Hunter', 5, [])).toEqual([])
    expect(suggestHitDice(null, 5, [])).toEqual([])
    expect(suggestHitDice('Fighter', 0, [])).toEqual([])
    expect(suggestHitDice('Fighter', 21, [])).toEqual([])
    expect(suggestHitDice('Fighter', 5, [hitDice(10)])).toEqual([])
    expect(suggestHitDice('Fighter', 5, [hitDice(8)])).toHaveLength(1)
  })
})
