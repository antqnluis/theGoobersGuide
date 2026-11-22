import { inventoryLimits, normalizeItemInput, validateItemInput } from './inventoryValidation'
import {
  abilityKeys,
  skillKeys,
  type AbilityKey,
  type CharacterAttack,
  type CharacterDetails,
  type CharacterDetailsInput,
  type CharacterItem,
  type CharacterItemValues,
  type CharacterPurse,
  type CharacterSheet,
  type CharacterSheetBody,
  type CharacterSummary,
  type CharacterVitals,
  type SkillKey,
  type SkillProficiency,
} from './characterTypes'
import {
  defaultSheetBody,
  limits,
  validateCharacterDetails,
  validateSheetBody,
  validateVitals,
} from './characterValidation'
import {
  characterDocumentVersion,
  checkEnvelope,
  documentFormats,
  isRecord,
  readJsonDocument,
  regenerateCharacterMessage,
} from './importText'

/**
 * The portable character document, version 3 (M03.8 §2.1), and the strict reader for it.
 * Strict means a bad value is reported, never trimmed or clamped; the review shows every error.
 */

export type DocumentIssue = { path: string; message: string }

/** A document's character after validation: the same shapes the rest of the app stores. */
export type ImportedCharacter = {
  details: CharacterDetails
  vitals: CharacterVitals
  body: CharacterSheetBody
  items: CharacterItemValues[]
  coins: CharacterPurse
}

export type CharacterDocumentResult =
  | { kind: 'rejected'; message: string }
  | {
      kind: 'parsed'
      /** Best effort: an invalid field takes its default, so the review can still show the rest. */
      character: ImportedCharacter
      issues: DocumentIssue[]
      /** Paths of fields that are not imported (application-owned or unknown). */
      ignored: string[]
      /** True when there are no issues and the character can be imported. */
      valid: boolean
    }

const knownCharacterKeys = new Set([
  'name',
  'species',
  'class_name',
  'subclass',
  'background',
  'level',
  'vitals',
  'abilities',
  'saving_throws',
  'skills',
  'attacks',
  'features',
  'spells',
  'notes',
  'alignment',
  'experience',
  'inventory',
  'currency',
])
const vitalKeys = ['max_hp', 'current_hp', 'temp_hp', 'armor_class', 'speed'] as const
const coinKeys = ['cp', 'sp', 'gp'] as const
const attackFields = ['name', 'bonus', 'damage', 'notes'] as const
const attackFieldMax = {
  name: limits.attackName,
  bonus: limits.attackBonus,
  damage: limits.attackDamage,
  notes: limits.attackNotes,
} as const
const itemKeys = new Set(['name', 'quantity', 'weight', 'description', 'equipped', 'attuned'])

class Reader {
  issues: DocumentIssue[] = []
  ignored: string[] = []

  issue(path: string, message: string) {
    this.issues.push({ path, message })
  }

  ignoreUnknown(value: Record<string, unknown>, known: ReadonlySet<string>, path: string) {
    for (const key of Object.keys(value)) {
      if (!known.has(key)) this.ignored.push(`${path}.${key}`)
    }
  }

  /** A string field. Wrong types are reported; a missing field is `undefined`. */
  string(value: unknown, path: string, label: string): string | undefined {
    if (value === undefined) return undefined
    if (typeof value !== 'string') {
      this.issue(path, `${label} must be text.`)
      return undefined
    }
    return value
  }

  /** Text or null; a missing field is `undefined`. */
  optionalString(value: unknown, path: string, label: string): string | null | undefined {
    if (value === null) return null
    return this.string(value, path, label)
  }

  integer(value: unknown, path: string, label: string): number | undefined {
    if (value === undefined) return undefined
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      this.issue(path, `${label} must be a whole number.`)
      return undefined
    }
    return value
  }
}

/** Reads a version-3 character document from pasted or uploaded text. */
export function parseCharacterDocument(text: string): CharacterDocumentResult {
  const read = readJsonDocument(text)
  if (!read.ok) return { kind: 'rejected', message: read.message }
  const refusal = checkEnvelope(
    read.value,
    { format: documentFormats.character, version: characterDocumentVersion },
    regenerateCharacterMessage,
  )
  if (refusal) return { kind: 'rejected', message: refusal }

  const root = read.value as Record<string, unknown>
  if (!isRecord(root.character)) {
    return { kind: 'rejected', message: 'The document has no character in it.' }
  }

  const reader = new Reader()
  reader.ignoreUnknown(root, new Set(['format', 'version', 'character']), '')
  reader.ignored = reader.ignored.map((path) => path.slice(1))
  const raw = root.character
  reader.ignoreUnknown(raw, knownCharacterKeys, 'character')

  const details = readDetails(reader, raw)
  const vitals = readVitals(reader, raw.vitals)
  const abilities = readAbilities(reader, raw.abilities)
  const savingThrows = readSavingThrows(reader, raw.saving_throws)
  const skills = readSkills(reader, raw.skills)
  const attacks = readAttacks(reader, raw.attacks)
  const items = readItems(reader, raw.inventory)
  const coins = readCoins(reader, raw.currency)

  const body: CharacterSheetBody = {
    ...defaultSheetBody(),
    abilities,
    saving_throws: savingThrows,
    skills,
    attacks,
  }
  for (const field of ['features', 'spells', 'notes'] as const) {
    const value = reader.string(raw[field], `character.${field}`, capitalize(field))
    if (value !== undefined) {
      if (value.length > limits.text) {
        reader.issue(
          `character.${field}`,
          `${capitalize(field)} can be up to ${limits.text.toLocaleString('en-US')} characters.`,
        )
      } else {
        body[field] = value
      }
    }
  }
  const alignment = reader.string(raw.alignment, 'character.alignment', 'Alignment')
  if (alignment !== undefined) {
    if (alignment.length > limits.alignment) {
      reader.issue('character.alignment', `Alignment can be up to ${limits.alignment} characters.`)
    } else {
      body.alignment = alignment
    }
  }
  if (raw.experience !== undefined && raw.experience !== null) {
    const experience = reader.integer(raw.experience, 'character.experience', 'Experience')
    if (experience !== undefined) {
      if (experience < 0 || experience > limits.experienceMax) {
        reader.issue('character.experience', 'Experience must be between 0 and 1,000,000.')
      } else {
        body.experience = experience
      }
    }
  }

  if (!reader.issues.some((issue) => issue.path.startsWith('character.attacks'))) {
    // The size check needs every other field, so it runs last and only on an otherwise clean body.
    for (const message of validateSheetBody(body)) {
      if (message.includes('too large')) reader.issue('character', message)
    }
  }

  const character: ImportedCharacter = { details, vitals, body, items, coins }
  return {
    kind: 'parsed',
    character,
    issues: reader.issues,
    ignored: reader.ignored,
    valid: reader.issues.length === 0,
  }
}

function capitalize(text: string) {
  return text[0].toUpperCase() + text.slice(1)
}

function readDetails(reader: Reader, raw: Record<string, unknown>): CharacterDetails {
  const input: CharacterDetailsInput = {
    name: '',
    species: '',
    class_name: '',
    subclass: '',
    background: '',
    level: 1,
  }
  const labels = {
    name: 'Name',
    species: 'Species',
    class_name: 'Class',
    subclass: 'Subclass',
    background: 'Background',
  } as const

  if (raw.name === undefined || raw.name === null) {
    reader.issue('character.name', 'Every character needs a name.')
  } else {
    input.name = reader.string(raw.name, 'character.name', 'Name') ?? ''
  }
  for (const field of ['species', 'class_name', 'subclass', 'background'] as const) {
    input[field] = reader.optionalString(raw[field], `character.${field}`, labels[field]) ?? ''
  }
  const level = reader.integer(raw.level, 'character.level', 'Level')
  if (level !== undefined) input.level = level

  // Range and length rules come from the same validator the form uses. Wrong types were
  // already reported above, so their (default) values are not reported a second time.
  const reported = new Set(reader.issues.map((issue) => issue.path))
  const errors = validateCharacterDetails(input)
  for (const [field, message] of Object.entries(errors)) {
    const path = `character.${field}`
    if (reported.has(path)) continue
    if (field === 'name' && raw.name === undefined) continue
    reader.issue(path, message)
  }

  return {
    name: input.name.trim(),
    species: input.species.trim() || null,
    class_name: input.class_name.trim() || null,
    subclass: input.subclass.trim() || null,
    background: input.background.trim() || null,
    level: input.level,
  }
}

function readVitals(reader: Reader, raw: unknown): CharacterVitals {
  const vitals: CharacterVitals = {
    max_hp: null,
    current_hp: null,
    temp_hp: 0,
    armor_class: null,
    speed: null,
  }
  if (raw === undefined) return vitals
  if (!isRecord(raw)) {
    reader.issue('character.vitals', 'Vitals must be an object.')
    return vitals
  }
  reader.ignoreUnknown(raw, new Set(vitalKeys), 'character.vitals')
  const failed = new Set<string>()
  for (const key of vitalKeys) {
    const value = raw[key]
    if (value === undefined) continue
    if (value === null && key !== 'temp_hp') {
      vitals[key] = null
    } else if (typeof value === 'number' && Number.isInteger(value)) {
      vitals[key] = value
    } else {
      failed.add(key)
      reader.issue(`character.vitals.${key}`, `${vitalLabels[key]} must be a whole number.`)
    }
  }
  const errors = validateVitals(vitals)
  for (const [key, message] of Object.entries(errors)) {
    if (!failed.has(key)) reader.issue(`character.vitals.${key}`, message)
  }
  return vitals
}

const vitalLabels = {
  max_hp: 'Maximum HP',
  current_hp: 'Current HP',
  temp_hp: 'Temporary HP',
  armor_class: 'Armor class',
  speed: 'Speed',
} as const

function readAbilities(reader: Reader, raw: unknown): Record<AbilityKey, number> {
  const abilities = { ...defaultSheetBody().abilities }
  if (raw === undefined) return abilities
  if (!isRecord(raw)) {
    reader.issue('character.abilities', 'Abilities must be an object of scores.')
    return abilities
  }
  for (const [key, value] of Object.entries(raw)) {
    const path = `character.abilities.${key}`
    if (!abilityKeys.includes(key as AbilityKey)) {
      reader.issue(path, `“${key}” isn’t an ability. Use str, dex, con, int, wis, or cha.`)
    } else if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < limits.abilityMin ||
      value > limits.abilityMax
    ) {
      reader.issue(path, 'Ability scores must be whole numbers between 1 and 30.')
    } else {
      abilities[key as AbilityKey] = value
    }
  }
  return abilities
}

function readSavingThrows(reader: Reader, raw: unknown): AbilityKey[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) {
    reader.issue('character.saving_throws', 'Saving throws must be a list of abilities.')
    return []
  }
  const seen = new Set<AbilityKey>()
  raw.forEach((value, index) => {
    const path = `character.saving_throws[${index}]`
    if (typeof value !== 'string' || !abilityKeys.includes(value as AbilityKey)) {
      reader.issue(path, 'Saving throws must use str, dex, con, int, wis, or cha.')
    } else if (seen.has(value as AbilityKey)) {
      reader.issue(path, `“${value}” is listed more than once.`)
    } else {
      seen.add(value as AbilityKey)
    }
  })
  return abilityKeys.filter((key) => seen.has(key))
}

function readSkills(reader: Reader, raw: unknown): Partial<Record<SkillKey, SkillProficiency>> {
  const skills: Partial<Record<SkillKey, SkillProficiency>> = {}
  if (raw === undefined) return skills
  if (!isRecord(raw)) {
    reader.issue('character.skills', 'Skills must be an object of skill names.')
    return skills
  }
  for (const [key, value] of Object.entries(raw)) {
    const path = `character.skills.${key}`
    if (!skillKeys.includes(key as SkillKey)) {
      reader.issue(
        path,
        `“${key}” isn’t a skill. Use names like animal_handling or sleight_of_hand.`,
      )
    } else if (value !== 'proficient' && value !== 'expertise') {
      reader.issue(path, 'A skill must be “proficient” or “expertise”.')
    } else {
      skills[key as SkillKey] = value
    }
  }
  return skills
}

function readAttacks(reader: Reader, raw: unknown): CharacterAttack[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) {
    reader.issue('character.attacks', 'Attacks must be a list.')
    return []
  }
  if (raw.length > limits.attacks) {
    reader.issue('character.attacks', `Add up to ${limits.attacks} attacks.`)
  }
  return raw.slice(0, limits.attacks).map((entry, index) => {
    const base = `character.attacks[${index}]`
    const attack: CharacterAttack = {
      id: crypto.randomUUID(),
      name: '',
      bonus: '',
      damage: '',
      notes: '',
    }
    if (!isRecord(entry)) {
      reader.issue(base, 'Each attack must be an object.')
      return attack
    }
    reader.ignoreUnknown(entry, new Set(attackFields), base)
    for (const field of attackFields) {
      const value = reader.string(entry[field], `${base}.${field}`, capitalize(field))
      if (value === undefined) continue
      if (value.length > attackFieldMax[field]) {
        reader.issue(
          `${base}.${field}`,
          `Attack ${field} can be up to ${attackFieldMax[field]} characters.`,
        )
      } else {
        attack[field] = value
      }
    }
    return attack
  })
}

function readItems(reader: Reader, raw: unknown): CharacterItemValues[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) {
    reader.issue('character.inventory', 'Inventory must be a list.')
    return []
  }
  if (raw.length > inventoryLimits.items) {
    reader.issue('character.inventory', `Add up to ${inventoryLimits.items} items.`)
  }
  return raw.slice(0, inventoryLimits.items).flatMap((entry, index) => {
    const base = `character.inventory[${index}]`
    if (!isRecord(entry)) {
      reader.issue(base, 'Each item must be an object.')
      return []
    }
    reader.ignoreUnknown(entry, itemKeys, base)

    const before = reader.issues.length
    const name = reader.string(entry.name, `${base}.name`, 'Name')
    if (entry.name === undefined) reader.issue(`${base}.name`, 'Every item needs a name.')
    const quantity = reader.integer(entry.quantity, `${base}.quantity`, 'Quantity')
    const description = reader.optionalString(
      entry.description,
      `${base}.description`,
      'Description',
    )
    let weight = ''
    if (entry.weight !== undefined && entry.weight !== null) {
      if (typeof entry.weight !== 'number' || !Number.isFinite(entry.weight)) {
        reader.issue(`${base}.weight`, 'Weight must be a number.')
      } else {
        // String(1e-7) and String(1.005) fail the two-decimal rule instead of passing silently.
        weight = String(entry.weight)
      }
    }
    for (const flag of ['equipped', 'attuned'] as const) {
      if (entry[flag] !== undefined && typeof entry[flag] !== 'boolean') {
        reader.issue(`${base}.${flag}`, `${capitalize(flag)} must be true or false.`)
      }
    }
    if (reader.issues.length > before) return []

    const input = {
      name: name ?? '',
      quantity: quantity ?? 1,
      weight,
      description: description ?? '',
      equipped: entry.equipped === true,
      attuned: entry.attuned === true,
    }
    const errors = validateItemInput(input)
    for (const [field, message] of Object.entries(errors)) {
      reader.issue(`${base}.${field}`, message)
    }
    return Object.keys(errors).length > 0 ? [] : [normalizeItemInput(input)]
  })
}

function readCoins(reader: Reader, raw: unknown): CharacterPurse {
  const coins: CharacterPurse = { cp: 0, sp: 0, gp: 0 }
  if (raw === undefined) return coins
  if (!isRecord(raw)) {
    reader.issue('character.currency', 'Currency must be an object of coin amounts.')
    return coins
  }
  for (const [key, value] of Object.entries(raw)) {
    const path = `character.currency.${key}`
    if (!coinKeys.includes(key as (typeof coinKeys)[number])) {
      reader.issue(
        path,
        `“${key}” isn’t supported. Coins are copper (cp), silver (sp), and gold (gp); convert other coins first.`,
      )
    } else if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > inventoryLimits.coinMax
    ) {
      reader.issue(path, 'Enter a whole number up to 9,999,999.')
    } else {
      coins[key as keyof CharacterPurse] = value
    }
  }
  return coins
}

/** The `import_character` payload: database-shaped, built from a valid document. */
export function toImportPayload(character: ImportedCharacter) {
  return {
    details: { ...character.details },
    vitals: { ...character.vitals },
    sheet: character.body,
    items: character.items.map((item) => ({ ...item })),
    coins: { ...character.coins },
  }
}

export type CharacterDocument = {
  format: typeof documentFormats.character
  version: typeof characterDocumentVersion
  character: {
    name: string
    species: string | null
    class_name: string | null
    subclass: string | null
    background: string | null
    level: number
    vitals: CharacterVitals
    abilities: Record<AbilityKey, number>
    saving_throws: AbilityKey[]
    skills: Partial<Record<SkillKey, SkillProficiency>>
    attacks: Array<Omit<CharacterAttack, 'id'> & { id?: string }>
    features: string
    spells: string
    notes: string
    alignment: string
    experience: number | null
    inventory: Array<CharacterItemValues & { id?: string }>
    currency: CharacterPurse
  }
}

/**
 * A version-3 document of a stored character. With `withIds`, attacks and items carry their
 * ids so an update prompt can target them exactly (D9); without them the document is a plain
 * copy that could be imported as a new character.
 */
export function toCharacterDocument(
  character: CharacterSummary,
  sheet: CharacterSheet,
  items: CharacterItem[],
  options: { withIds: boolean },
): CharacterDocument {
  const { withIds } = options
  return {
    format: documentFormats.character,
    version: characterDocumentVersion,
    character: {
      name: character.name,
      species: character.species,
      class_name: character.class_name,
      subclass: character.subclass,
      background: character.background,
      level: character.level,
      vitals: {
        max_hp: sheet.max_hp,
        current_hp: sheet.current_hp,
        temp_hp: sheet.temp_hp,
        armor_class: sheet.armor_class,
        speed: sheet.speed,
      },
      abilities: { ...sheet.sheet.abilities },
      saving_throws: [...sheet.sheet.saving_throws],
      skills: { ...sheet.sheet.skills },
      attacks: sheet.sheet.attacks.map((attack) => ({
        ...(withIds ? { id: attack.id } : {}),
        name: attack.name,
        bonus: attack.bonus,
        damage: attack.damage,
        notes: attack.notes,
      })),
      features: sheet.sheet.features,
      spells: sheet.sheet.spells,
      notes: sheet.sheet.notes,
      alignment: sheet.sheet.alignment,
      experience: sheet.sheet.experience,
      inventory: items.map((item) => ({
        ...(withIds ? { id: item.id } : {}),
        name: item.name,
        quantity: item.quantity,
        weight: item.weight,
        description: item.description,
        equipped: item.equipped,
        attuned: item.attuned,
      })),
      currency: { cp: sheet.cp, sp: sheet.sp, gp: sheet.gp },
    },
  }
}
