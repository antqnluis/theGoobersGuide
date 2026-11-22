import {
  skillKeys,
  type AbilityKey,
  type CharacterSheetBody,
  type SkillKey,
} from './characterTypes'

/** Derived values are computed here and never stored (plan §5.1). */

export const abilityLabels: Record<AbilityKey, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
}

export const skillAbilities: Record<SkillKey, AbilityKey> = {
  acrobatics: 'dex',
  animal_handling: 'wis',
  arcana: 'int',
  athletics: 'str',
  deception: 'cha',
  history: 'int',
  insight: 'wis',
  intimidation: 'cha',
  investigation: 'int',
  medicine: 'wis',
  nature: 'int',
  perception: 'wis',
  performance: 'cha',
  persuasion: 'cha',
  religion: 'int',
  sleight_of_hand: 'dex',
  stealth: 'dex',
  survival: 'wis',
}

export const skillLabels: Record<SkillKey, string> = {
  acrobatics: 'Acrobatics',
  animal_handling: 'Animal Handling',
  arcana: 'Arcana',
  athletics: 'Athletics',
  deception: 'Deception',
  history: 'History',
  insight: 'Insight',
  intimidation: 'Intimidation',
  investigation: 'Investigation',
  medicine: 'Medicine',
  nature: 'Nature',
  perception: 'Perception',
  performance: 'Performance',
  persuasion: 'Persuasion',
  religion: 'Religion',
  sleight_of_hand: 'Sleight of Hand',
  stealth: 'Stealth',
  survival: 'Survival',
}

/** Every skill with its governing ability, in alphabetical order. */
export const skillList = skillKeys.map((key) => ({
  key,
  label: skillLabels[key],
  ability: skillAbilities[key],
}))

export function abilityModifier(score: number) {
  return Math.floor((score - 10) / 2)
}

/** Proficiency bonus from character level: +2 at levels 1–4 up to +6 at 17–20. */
export function proficiencyBonus(level: number) {
  return Math.ceil(level / 4) + 1
}

export function formatModifier(value: number) {
  return value >= 0 ? `+${value}` : `−${Math.abs(value)}`
}

export function savingThrowBonus(body: CharacterSheetBody, level: number, ability: AbilityKey) {
  const proficient = body.saving_throws.includes(ability)
  return abilityModifier(body.abilities[ability]) + (proficient ? proficiencyBonus(level) : 0)
}

export function skillBonus(body: CharacterSheetBody, level: number, skill: SkillKey) {
  const base = abilityModifier(body.abilities[skillAbilities[skill]])
  const proficiency = body.skills[skill]
  if (proficiency === 'expertise') return base + proficiencyBonus(level) * 2
  if (proficiency === 'proficient') return base + proficiencyBonus(level)
  return base
}

export function initiativeBonus(body: CharacterSheetBody) {
  return abilityModifier(body.abilities.dex)
}

export function passivePerception(body: CharacterSheetBody, level: number) {
  return 10 + skillBonus(body, level, 'perception')
}
