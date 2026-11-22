import { describe, expect, it } from 'vitest'
import {
  abilityModifier,
  formatModifier,
  initiativeBonus,
  passivePerception,
  proficiencyBonus,
  savingThrowBonus,
  skillBonus,
  skillList,
} from './characterSheetRules'
import { skillKeys } from './characterTypes'
import { defaultSheetBody } from './characterValidation'

describe('abilityModifier', () => {
  it.each([
    [1, -5],
    [3, -4],
    [8, -1],
    [9, -1],
    [10, 0],
    [11, 0],
    [12, 1],
    [15, 2],
    [18, 4],
    [20, 5],
    [30, 10],
  ])('score %i gives %i', (score, modifier) => {
    expect(abilityModifier(score)).toBe(modifier)
  })

  it('is defined across the full 1–30 range', () => {
    for (let score = 1; score <= 30; score += 1) {
      expect(abilityModifier(score)).toBe(Math.floor((score - 10) / 2))
    }
  })
})

describe('proficiencyBonus', () => {
  it.each([
    [1, 2],
    [4, 2],
    [5, 3],
    [8, 3],
    [9, 4],
    [12, 4],
    [13, 5],
    [16, 5],
    [17, 6],
    [20, 6],
  ])('level %i gives +%i', (level, bonus) => {
    expect(proficiencyBonus(level)).toBe(bonus)
  })
})

describe('formatModifier', () => {
  it('signs values with a real minus', () => {
    expect(formatModifier(3)).toBe('+3')
    expect(formatModifier(0)).toBe('+0')
    expect(formatModifier(-2)).toBe('−2')
  })
})

describe('bonuses', () => {
  const body = {
    ...defaultSheetBody(),
    abilities: { str: 18, dex: 14, con: 12, int: 8, wis: 13, cha: 10 },
    saving_throws: ['str' as const, 'con' as const],
    skills: {
      athletics: 'proficient' as const,
      stealth: 'expertise' as const,
      perception: 'proficient' as const,
    },
  }

  it('adds proficiency to proficient saves only', () => {
    expect(savingThrowBonus(body, 5, 'str')).toBe(4 + 3)
    expect(savingThrowBonus(body, 5, 'con')).toBe(1 + 3)
    expect(savingThrowBonus(body, 5, 'dex')).toBe(2)
    expect(savingThrowBonus(body, 5, 'int')).toBe(-1)
  })

  it('adds proficiency once, expertise twice, and nothing otherwise', () => {
    expect(skillBonus(body, 5, 'athletics')).toBe(4 + 3)
    expect(skillBonus(body, 5, 'stealth')).toBe(2 + 6)
    expect(skillBonus(body, 5, 'arcana')).toBe(-1)
  })

  it('derives initiative and passive Perception', () => {
    expect(initiativeBonus(body)).toBe(2)
    expect(passivePerception(body, 5)).toBe(10 + 1 + 3)
    expect(passivePerception(defaultSheetBody(), 1)).toBe(10)
  })
})

describe('skillList', () => {
  it('lists all eighteen skills with their abilities', () => {
    expect(skillList.map((skill) => skill.key)).toEqual([...skillKeys])
    expect(skillList.find((skill) => skill.key === 'sleight_of_hand')).toEqual({
      key: 'sleight_of_hand',
      label: 'Sleight of Hand',
      ability: 'dex',
    })
    expect(skillList).toHaveLength(18)
  })
})
