import { describe, expect, it } from 'vitest'
import { formatSpec } from '../dice/diceNotation'
import {
  abilityCheckRoll,
  attackDamageRoll,
  attackHitRoll,
  initiativeRoll,
  savingThrowRoll,
  skillRoll,
} from './characterRolls'
import type { CharacterAttack } from './characterTypes'
import { defaultSheetBody } from './characterValidation'

const id = '00000000-0000-4000-8000-000000000021'
const body = {
  ...defaultSheetBody(),
  abilities: { str: 18, dex: 14, con: 12, int: 8, wis: 13, cha: 10 },
  saving_throws: ['str' as const],
  skills: { athletics: 'proficient' as const, stealth: 'expertise' as const },
}

const attack = (overrides: Partial<CharacterAttack> = {}): CharacterAttack => ({
  id: '3f1c9a52-8d4e-4b7a-9c61-0a2b5d7e9f10',
  name: 'Longsword',
  bonus: '+5',
  damage: '1d8+3 slashing',
  notes: '',
  ...overrides,
})

describe('sheet rolls', () => {
  it('rolls an ability check with the modifier', () => {
    const roll = abilityCheckRoll(body, 'str', id)
    expect(roll).toMatchObject({ label: 'Strength check', source: 'ability', characterId: id })
    expect(formatSpec(roll.spec)).toBe('1d20 + 4')
    expect(formatSpec(abilityCheckRoll(body, 'cha', id).spec)).toBe('1d20')
    expect(formatSpec(abilityCheckRoll(body, 'int', id).spec)).toBe('1d20 - 1')
  })

  it('adds proficiency to a saving throw it is proficient in', () => {
    const level = 5 // proficiency +3
    expect(formatSpec(savingThrowRoll(body, level, 'str', id).spec)).toBe('1d20 + 7')
    expect(formatSpec(savingThrowRoll(body, level, 'dex', id).spec)).toBe('1d20 + 2')
    expect(savingThrowRoll(body, level, 'dex', id)).toMatchObject({
      label: 'Dexterity save',
      source: 'save',
    })
  })

  it('adds proficiency or expertise to a skill', () => {
    expect(formatSpec(skillRoll(body, 5, 'athletics', id).spec)).toBe('1d20 + 7')
    expect(formatSpec(skillRoll(body, 5, 'stealth', id).spec)).toBe('1d20 + 8')
    expect(formatSpec(skillRoll(body, 5, 'arcana', id).spec)).toBe('1d20 - 1')
    expect(skillRoll(body, 5, 'sleight_of_hand', id).label).toBe('Sleight of Hand check')
  })

  it('rolls initiative from Dexterity', () => {
    const roll = initiativeRoll(body, id)
    expect(roll).toMatchObject({ label: 'Initiative', source: 'initiative' })
    expect(formatSpec(roll.spec)).toBe('1d20 + 2')
  })
})

describe('attack rolls', () => {
  it('reads the bonus and carries the damage for a critical', () => {
    const roll = attackHitRoll(attack(), id)!
    expect(roll).toMatchObject({ label: 'Longsword attack', source: 'attack', characterId: id })
    expect(formatSpec(roll.spec)).toBe('1d20 + 5')
    expect(roll.critical?.label).toBe('Longsword damage — slashing')
    expect(formatSpec(roll.critical!.spec)).toBe('1d8 + 3')
  })

  it('has no critical when there is no damage to roll', () => {
    expect(attackHitRoll(attack({ damage: '' }), id)!.critical).toBeUndefined()
    expect(attackHitRoll(attack({ damage: 'see notes' }), id)!.critical).toBeUndefined()
  })

  it('has no to-hit roll when the bonus is not a number', () => {
    expect(attackHitRoll(attack({ bonus: '' }), id)).toBeNull()
    expect(attackHitRoll(attack({ bonus: '+5 to hit' }), id)).toBeNull()
  })

  it('names each kind of damage in the label', () => {
    const roll = attackDamageRoll(attack({ damage: '1d8+3 slashing plus 2d6 fire' }), id)!
    expect(roll.label).toBe('Longsword damage — slashing + fire')
    expect(formatSpec(roll.spec)).toBe('1d8 + 3 + 2d6')
    expect(roll.source).toBe('damage')
  })

  it('leaves the detail out when the damage names nothing', () => {
    expect(attackDamageRoll(attack({ damage: '1d10' }), id)!.label).toBe('Longsword damage')
  })

  it('has no damage roll without dice', () => {
    expect(attackDamageRoll(attack({ damage: 'crushing' }), id)).toBeNull()
    expect(attackDamageRoll(attack({ damage: '' }), id)).toBeNull()
  })

  it('labels an unnamed attack plainly', () => {
    expect(attackHitRoll(attack({ name: '  ' }), id)!.label).toBe('Attack')
    expect(attackDamageRoll(attack({ name: '' }), id)!.label).toBe('Damage — slashing')
  })
})
