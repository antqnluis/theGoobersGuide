import { describe, expect, it } from 'vitest'
import type { CharacterDetailsInput, CharacterSheetBody } from './characterTypes'
import {
  defaultSheetBody,
  limits,
  normalizeSheet,
  toCharacterDetails,
  validateCharacterDetails,
  validateSheetBody,
  validateVitals,
} from './characterValidation'

const details: CharacterDetailsInput = {
  name: 'Brand',
  species: '',
  class_name: '',
  subclass: '',
  background: '',
  level: 1,
}

describe('validateCharacterDetails', () => {
  it('accepts a name and level alone', () => {
    expect(validateCharacterDetails(details)).toEqual({})
  })

  it.each([
    ['empty', ''],
    ['blank', '   '],
    ['too long', 'x'.repeat(81)],
    ['with a control character', 'tab\there'],
  ])('rejects a name that is %s', (_label, name) => {
    expect(validateCharacterDetails({ ...details, name }).name).toBe(
      'Enter a name of up to 80 characters.',
    )
  })

  it('accepts an 80-character name', () => {
    expect(validateCharacterDetails({ ...details, name: 'x'.repeat(80) })).toEqual({})
  })

  it.each(['species', 'class_name', 'subclass', 'background'] as const)(
    'bounds %s at 60 characters but allows it empty',
    (field) => {
      expect(validateCharacterDetails({ ...details, [field]: '' })).toEqual({})
      expect(validateCharacterDetails({ ...details, [field]: 'x'.repeat(60) })).toEqual({})
      expect(validateCharacterDetails({ ...details, [field]: 'x'.repeat(61) })[field]).toBe(
        'Species, class, subclass, and background can be up to 60 characters.',
      )
    },
  )

  it.each([0, 21, 1.5, Number.NaN])('rejects level %s', (level) => {
    expect(validateCharacterDetails({ ...details, level }).level).toBe(
      'Level must be between 1 and 20.',
    )
  })

  it.each([1, 20])('accepts level %s', (level) => {
    expect(validateCharacterDetails({ ...details, level })).toEqual({})
  })
})

describe('toCharacterDetails', () => {
  it('trims text and stores empty optionals as null', () => {
    expect(
      toCharacterDetails({
        name: '  Brand ',
        species: ' Elf ',
        class_name: '   ',
        subclass: '',
        background: ' Sage',
        level: 4,
      }),
    ).toEqual({
      name: 'Brand',
      species: 'Elf',
      class_name: null,
      subclass: null,
      background: 'Sage',
      level: 4,
    })
  })
})

describe('validateVitals', () => {
  const vitals = { max_hp: 30, current_hp: 12, temp_hp: 0, armor_class: 15, speed: 30 }

  it('accepts set and unset vitals', () => {
    expect(validateVitals(vitals)).toEqual({})
    expect(
      validateVitals({
        max_hp: null,
        current_hp: null,
        temp_hp: 0,
        armor_class: null,
        speed: null,
      }),
    ).toEqual({})
  })

  it('applies the column ranges', () => {
    expect(validateVitals({ ...vitals, max_hp: 0 }).max_hp).toBeDefined()
    expect(validateVitals({ ...vitals, max_hp: 10000 }).max_hp).toBeDefined()
    expect(validateVitals({ ...vitals, current_hp: -1 }).current_hp).toBeDefined()
    expect(validateVitals({ ...vitals, temp_hp: -1 }).temp_hp).toBeDefined()
    expect(validateVitals({ ...vitals, armor_class: 100 }).armor_class).toBeDefined()
    expect(validateVitals({ ...vitals, speed: 1000 }).speed).toBeDefined()
    expect(validateVitals({ ...vitals, speed: 2.5 }).speed).toBeDefined()
  })

  it('refuses current HP above maximum HP', () => {
    expect(validateVitals({ ...vitals, current_hp: 31 }).current_hp).toBe(
      'Current HP can’t be higher than maximum HP.',
    )
    expect(validateVitals({ ...vitals, max_hp: null, current_hp: 500 })).toEqual({})
  })
})

describe('normalizeSheet', () => {
  it.each([[{}], [{ version: 1 }], [null], [undefined], ['text'], [[]], [42]])(
    'turns %j into the complete default body',
    (raw) => {
      expect(normalizeSheet(raw)).toEqual(defaultSheetBody())
    },
  )

  it('keeps valid parts and defaults the rest', () => {
    const body = normalizeSheet({
      version: 1,
      abilities: { str: 18, dex: 8 },
      saving_throws: ['con', 'str'],
      skills: { stealth: 'expertise', arcana: 'proficient' },
      attacks: [{ name: 'Axe', bonus: '+6' }],
      features: 'Rage',
      alignment: 'CN',
      experience: 300,
    })
    expect(body.abilities).toEqual({ str: 18, dex: 8, con: 10, int: 10, wis: 10, cha: 10 })
    expect(body.saving_throws).toEqual(['str', 'con'])
    expect(body.skills).toEqual({ arcana: 'proficient', stealth: 'expertise' })
    expect(body.attacks).toEqual([{ name: 'Axe', bonus: '+6', damage: '', notes: '' }])
    expect(body.features).toBe('Rage')
    expect(body.spells).toBe('')
    expect(body.alignment).toBe('CN')
    expect(body.experience).toBe(300)
  })

  it('drops unknown keys and invalid values', () => {
    const body = normalizeSheet({
      mystery: true,
      abilities: { str: 31, dex: 0, con: 10.5, luck: 12, int: 'high' },
      saving_throws: ['luck', 'dex', 'dex'],
      skills: { flying: 'proficient', stealth: 'master' },
      attacks: ['sword', 7, { name: 5 }],
      features: 7,
      experience: -1,
    })
    expect(body).toEqual({
      ...defaultSheetBody(),
      saving_throws: ['dex'],
      attacks: [{ name: '', bonus: '', damage: '', notes: '' }],
    })
    expect('mystery' in body).toBe(false)
  })

  it('caps attacks and text length', () => {
    const body = normalizeSheet({
      attacks: Array.from({ length: 40 }, () => ({})),
      notes: 'x'.repeat(9000),
    })
    expect(body.attacks).toHaveLength(limits.attacks)
    expect(body.notes).toHaveLength(limits.text)
  })
})

describe('validateSheetBody', () => {
  const valid = (): CharacterSheetBody => defaultSheetBody()

  it('accepts the default body and a full body', () => {
    expect(validateSheetBody(valid())).toEqual([])
    expect(
      validateSheetBody({
        ...valid(),
        saving_throws: ['str', 'con'],
        skills: { athletics: 'expertise' },
        attacks: [{ name: 'Axe', bonus: '+6', damage: '1d12+4', notes: '' }],
        features: 'Rage',
        experience: 300,
      }),
    ).toEqual([])
  })

  it.each([
    ['ability above 30', (b: CharacterSheetBody) => void (b.abilities.str = 31)],
    ['ability below 1', (b: CharacterSheetBody) => void (b.abilities.dex = 0)],
    ['fractional ability', (b: CharacterSheetBody) => void (b.abilities.con = 10.5)],
    ['duplicate saves', (b: CharacterSheetBody) => void (b.saving_throws = ['str', 'str'])],
    [
      'invalid skill level',
      (b: CharacterSheetBody) => void ((b.skills as Record<string, string>).stealth = 'master'),
    ],
    [
      'too many attacks',
      (b: CharacterSheetBody) =>
        void (b.attacks = Array.from({ length: 31 }, () => ({
          name: '',
          bonus: '',
          damage: '',
          notes: '',
        }))),
    ],
    [
      'long attack name',
      (b: CharacterSheetBody) =>
        void (b.attacks = [{ name: 'x'.repeat(81), bonus: '', damage: '', notes: '' }]),
    ],
    ['long features', (b: CharacterSheetBody) => void (b.features = 'x'.repeat(8001))],
    ['long alignment', (b: CharacterSheetBody) => void (b.alignment = 'x'.repeat(41))],
    ['negative experience', (b: CharacterSheetBody) => void (b.experience = -1)],
    ['huge experience', (b: CharacterSheetBody) => void (b.experience = 1_000_001)],
    [
      'oversized body',
      (b: CharacterSheetBody) => {
        b.features = 'é'.repeat(8000)
        b.spells = 'é'.repeat(8000)
        b.notes = 'é'.repeat(8000)
        b.attacks = Array.from({ length: 30 }, () => ({
          name: 'é'.repeat(80),
          bonus: 'é'.repeat(20),
          damage: 'é'.repeat(60),
          notes: 'é'.repeat(200),
        }))
      },
    ],
  ])('rejects %s', (_label, mutate) => {
    const body = valid()
    mutate(body)
    expect(validateSheetBody(body).length).toBeGreaterThan(0)
  })
})
