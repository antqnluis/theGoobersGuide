import {
  abilityKeys,
  skillKeys,
  type AbilityKey,
  type CharacterAttack,
  type CharacterDetails,
  type CharacterDetailsInput,
  type CharacterSheetBody,
  type CharacterVitals,
  type SkillKey,
  type SkillProficiency,
} from './characterTypes'

/** Mirrors the database CHECK constraints and RPC checks (plan §2.1, §2.2, §5.2). */
export const limits = {
  name: 80,
  detail: 60,
  levelMin: 1,
  levelMax: 20,
  abilityMin: 1,
  abilityMax: 30,
  attacks: 30,
  attackName: 80,
  attackBonus: 20,
  attackDamage: 60,
  attackNotes: 200,
  text: 8000,
  alignment: 40,
  experienceMax: 1_000_000,
  // The database allows 65,536 bytes of jsonb text, which spaces out ": " and ", ".
  sheetBytes: 60_000,
} as const

// eslint-disable-next-line no-control-regex
const controlCharacters = /[\u0000-\u001f\u007f-\u009f]/

export type DetailsErrors = Partial<Record<keyof CharacterDetailsInput, string>>

const nameMessage = 'Enter a name of up to 80 characters.'
const detailsMessage = 'Species, class, subclass, and background can be up to 60 characters.'
const levelMessage = 'Level must be between 1 and 20.'

function fits(value: string, max: number) {
  return value.length >= 1 && value.length <= max && !controlCharacters.test(value)
}

/** Per-field errors for the create and edit form; an empty object means valid. */
export function validateCharacterDetails(input: CharacterDetailsInput): DetailsErrors {
  const errors: DetailsErrors = {}
  if (!fits(input.name.trim(), limits.name)) errors.name = nameMessage
  for (const field of ['species', 'class_name', 'subclass', 'background'] as const) {
    const value = input[field].trim()
    if (value && !fits(value, limits.detail)) errors[field] = detailsMessage
  }
  if (
    !Number.isInteger(input.level) ||
    input.level < limits.levelMin ||
    input.level > limits.levelMax
  ) {
    errors.level = levelMessage
  }
  return errors
}

/** Trims text and stores empty optional fields as null, as the database expects. */
export function toCharacterDetails(input: CharacterDetailsInput): CharacterDetails {
  const optional = (value: string) => value.trim() || null
  return {
    name: input.name.trim(),
    species: optional(input.species),
    class_name: optional(input.class_name),
    subclass: optional(input.subclass),
    background: optional(input.background),
    level: input.level,
  }
}

type VitalsErrors = Partial<Record<keyof CharacterVitals, string>>

function inRange(value: number | null, min: number, max: number) {
  return value === null || (Number.isInteger(value) && value >= min && value <= max)
}

/** Vitals rules from the sheet columns' CHECK constraints. */
export function validateVitals(vitals: CharacterVitals): VitalsErrors {
  const errors: VitalsErrors = {}
  if (!inRange(vitals.max_hp, 1, 9999)) errors.max_hp = 'Maximum HP must be between 1 and 9999.'
  if (!inRange(vitals.current_hp, 0, 9999)) {
    errors.current_hp = 'Current HP must be between 0 and 9999.'
  } else if (
    vitals.max_hp !== null &&
    vitals.current_hp !== null &&
    vitals.current_hp > vitals.max_hp &&
    !errors.max_hp
  ) {
    errors.current_hp = 'Current HP can’t be higher than maximum HP.'
  }
  if (!inRange(vitals.temp_hp, 0, 9999) || vitals.temp_hp === null) {
    errors.temp_hp = 'Temporary HP must be between 0 and 9999.'
  }
  if (!inRange(vitals.armor_class, 0, 99)) {
    errors.armor_class = 'Armor class must be between 0 and 99.'
  }
  if (!inRange(vitals.speed, 0, 999)) errors.speed = 'Speed must be between 0 and 999.'
  return errors
}

export function defaultSheetBody(): CharacterSheetBody {
  return {
    version: 1,
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    saving_throws: [],
    skills: {},
    attacks: [],
    features: '',
    spells: '',
    notes: '',
    alignment: '',
    experience: null,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown, max: number) {
  return typeof value === 'string' ? value.slice(0, max) : ''
}

/**
 * Turns any stored body (`{}`, `{"version":1}`, partial, or with unknown keys) into a
 * complete version-1 object, so readers never crash on partial data. Invalid parts fall
 * back to their defaults; unknown keys are dropped.
 */
export function normalizeSheet(raw: unknown): CharacterSheetBody {
  const body = defaultSheetBody()
  if (!isRecord(raw)) return body

  if (isRecord(raw.abilities)) {
    for (const key of abilityKeys) {
      const score = raw.abilities[key]
      if (
        typeof score === 'number' &&
        Number.isInteger(score) &&
        score >= limits.abilityMin &&
        score <= limits.abilityMax
      ) {
        body.abilities[key] = score
      }
    }
  }

  if (Array.isArray(raw.saving_throws)) {
    const seen = new Set<AbilityKey>()
    for (const key of raw.saving_throws) {
      if (abilityKeys.includes(key as AbilityKey)) seen.add(key as AbilityKey)
    }
    body.saving_throws = abilityKeys.filter((key) => seen.has(key))
  }

  if (isRecord(raw.skills)) {
    for (const key of skillKeys) {
      const level = raw.skills[key]
      if (level === 'proficient' || level === 'expertise') body.skills[key] = level
    }
  }

  if (Array.isArray(raw.attacks)) {
    body.attacks = raw.attacks
      .filter(isRecord)
      .slice(0, limits.attacks)
      .map((attack) => ({
        name: text(attack.name, limits.attackName),
        bonus: text(attack.bonus, limits.attackBonus),
        damage: text(attack.damage, limits.attackDamage),
        notes: text(attack.notes, limits.attackNotes),
      }))
  }

  body.features = text(raw.features, limits.text)
  body.spells = text(raw.spells, limits.text)
  body.notes = text(raw.notes, limits.text)
  body.alignment = text(raw.alignment, limits.alignment)

  if (
    typeof raw.experience === 'number' &&
    Number.isInteger(raw.experience) &&
    raw.experience >= 0 &&
    raw.experience <= limits.experienceMax
  ) {
    body.experience = raw.experience
  }
  return body
}

export type SheetBodyErrors = string[]

/** Everything the database checks plus the per-field text limits; empty means valid. */
export function validateSheetBody(body: CharacterSheetBody): SheetBodyErrors {
  const errors: string[] = []

  for (const key of abilityKeys) {
    const score = body.abilities[key]
    if (!Number.isInteger(score) || score < limits.abilityMin || score > limits.abilityMax) {
      errors.push('Ability scores must be whole numbers between 1 and 30.')
      break
    }
  }
  const saves = body.saving_throws
  if (new Set(saves).size !== saves.length || saves.some((key) => !abilityKeys.includes(key))) {
    errors.push('Saving throws must be unique abilities.')
  }
  for (const [key, level] of Object.entries(body.skills)) {
    if (!skillKeys.includes(key as SkillKey) || !isProficiency(level)) {
      errors.push('Skills must be proficient or expertise.')
      break
    }
  }
  if (body.attacks.length > limits.attacks) {
    errors.push(`Add up to ${limits.attacks} attacks.`)
  }
  if (body.attacks.some(attackTooLong)) {
    errors.push(
      `Attack names can be up to ${limits.attackName} characters, bonuses ${limits.attackBonus}, damage ${limits.attackDamage}, and notes ${limits.attackNotes}.`,
    )
  }
  for (const [label, value] of [
    ['Features', body.features],
    ['Spells', body.spells],
    ['Notes', body.notes],
  ] as const) {
    if (value.length > limits.text) {
      errors.push(`${label} can be up to ${limits.text.toLocaleString('en-US')} characters.`)
    }
  }
  if (body.alignment.length > limits.alignment) {
    errors.push(`Alignment can be up to ${limits.alignment} characters.`)
  }
  if (
    body.experience !== null &&
    (!Number.isInteger(body.experience) ||
      body.experience < 0 ||
      body.experience > limits.experienceMax)
  ) {
    errors.push('Experience must be between 0 and 1,000,000.')
  }
  if (new TextEncoder().encode(JSON.stringify(body)).length > limits.sheetBytes) {
    errors.push('This sheet is too large to save. Shorten the longer text fields.')
  }
  return errors
}

function isProficiency(value: unknown): value is SkillProficiency {
  return value === 'proficient' || value === 'expertise'
}

function attackTooLong(attack: CharacterAttack) {
  return (
    attack.name.length > limits.attackName ||
    attack.bonus.length > limits.attackBonus ||
    attack.damage.length > limits.attackDamage ||
    attack.notes.length > limits.attackNotes
  )
}
