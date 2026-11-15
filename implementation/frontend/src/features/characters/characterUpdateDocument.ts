import { inventoryLimits, normalizeItemInput, validateItemInput } from './inventoryValidation'
import {
  abilityKeys,
  denominations,
  skillKeys,
  type AbilityKey,
  type CharacterAttack,
  type CharacterDetailsInput,
  type CharacterItem,
  type CharacterItemInput,
  type CharacterItemValues,
  type CharacterPurse,
  type CharacterSheet,
  type CharacterSheetBody,
  type CharacterSummary,
  type CharacterVitals,
  type Denomination,
  type SkillKey,
  type SkillProficiency,
} from './characterTypes'
import { abilityLabels, skillLabels } from './characterSheetRules'
import {
  limits,
  normalizeSheet,
  validateCharacterDetails,
  validateSheetBody,
  validateVitals,
} from './characterValidation'
import {
  checkEnvelope,
  documentFormats,
  isRecord,
  readJsonDocument,
  regenerateUpdateMessage,
  updateDocumentVersion,
} from './importText'

/**
 * The changes-only update document, version 2 (M03.8 §2.2): parsing, turning it into a list of
 * reviewable changes against the character as it is now, and building the database payload
 * from the changes the owner selects.
 */

type Rec = Record<string, unknown>

type AttackOp =
  | { op: 'add'; entry: Rec }
  | { op: 'update'; id: unknown; set: Rec }
  | { op: 'remove'; id: unknown }
type ItemOp = AttackOp

export type CharacterUpdate = {
  details: { set: Rec; clear: unknown[] }
  vitals: { set: Rec }
  abilities: { set: Rec }
  saving_throws: { add: unknown[]; remove: unknown[] }
  skills: { set: Rec; remove: unknown[] }
  attacks: AttackOp[]
  text: { set: Rec }
  inventory: ItemOp[]
  currency: { set: Rec }
  issues: string[]
}

export type UpdateParseResult =
  | { kind: 'rejected'; message: string }
  | { kind: 'parsed'; update: CharacterUpdate; ignored: string[] }

const sections = [
  'details',
  'vitals',
  'abilities',
  'saving_throws',
  'skills',
  'attacks',
  'text',
  'inventory',
  'currency',
] as const

/** Reads a version-2 update document from pasted or uploaded text. */
export function parseCharacterUpdate(text: string): UpdateParseResult {
  const read = readJsonDocument(text)
  if (!read.ok) return { kind: 'rejected', message: read.message }
  const refusal = checkEnvelope(
    read.value,
    { format: documentFormats.update, version: updateDocumentVersion },
    regenerateUpdateMessage,
  )
  if (refusal) return { kind: 'rejected', message: refusal }

  const root = read.value as Rec
  if (!isRecord(root.changes)) {
    return { kind: 'rejected', message: 'The update has no changes section.' }
  }
  const problems: string[] = []
  const ignored: string[] = []
  for (const key of Object.keys(root)) {
    if (!['format', 'version', 'changes', 'issues'].includes(key)) ignored.push(key)
  }

  let issues: string[] = []
  if (root.issues !== undefined) {
    if (Array.isArray(root.issues) && root.issues.every((issue) => typeof issue === 'string')) {
      issues = root.issues as string[]
    } else {
      problems.push('“issues” must be a list of text.')
    }
  }

  const changes = root.changes
  for (const key of Object.keys(changes)) {
    if (!(sections as readonly string[]).includes(key)) ignored.push(`changes.${key}`)
  }

  const record = (value: unknown, path: string, allowed: string[]): Rec => {
    if (value === undefined) return {}
    if (!isRecord(value)) {
      problems.push(`“${path}” must be an object.`)
      return {}
    }
    for (const key of Object.keys(value)) {
      if (!allowed.includes(key)) problems.push(`“${path}.${key}” isn’t part of the format.`)
    }
    return value
  }
  const list = (value: unknown, path: string): unknown[] => {
    if (value === undefined) return []
    if (!Array.isArray(value)) {
      problems.push(`“${path}” must be a list.`)
      return []
    }
    return value
  }
  const setOf = (value: unknown, path: string): Rec => {
    const container = record(value, path, ['set'])
    if (container.set === undefined) return {}
    if (!isRecord(container.set)) {
      problems.push(`“${path}.set” must be an object.`)
      return {}
    }
    return container.set
  }
  const operations = (value: unknown, path: string): AttackOp[] => {
    const result: AttackOp[] = []
    list(value, path).forEach((entry, index) => {
      const where = `${path}[${index}]`
      if (!isRecord(entry)) {
        problems.push(`“${where}” must be an object.`)
      } else if (entry.op === 'add') {
        if (isRecord(entry.entry)) result.push({ op: 'add', entry: entry.entry })
        else problems.push(`“${where}.entry” must be an object.`)
      } else if (entry.op === 'update') {
        if (isRecord(entry.set)) result.push({ op: 'update', id: entry.id, set: entry.set })
        else problems.push(`“${where}.set” must be an object.`)
      } else if (entry.op === 'remove') {
        result.push({ op: 'remove', id: entry.id })
      } else {
        problems.push(`“${where}.op” must be add, update, or remove.`)
      }
    })
    return result
  }

  const details = record(changes.details, 'details', ['set', 'clear'])
  const savingThrows = record(changes.saving_throws, 'saving_throws', ['add', 'remove'])
  const skills = record(changes.skills, 'skills', ['set', 'remove'])
  const update: CharacterUpdate = {
    details: {
      set: setOf({ set: details.set }, 'details'),
      clear: list(details.clear, 'details.clear'),
    },
    vitals: { set: setOf(changes.vitals, 'vitals') },
    abilities: { set: setOf(changes.abilities, 'abilities') },
    saving_throws: {
      add: list(savingThrows.add, 'saving_throws.add'),
      remove: list(savingThrows.remove, 'saving_throws.remove'),
    },
    skills: {
      set: setOf({ set: skills.set }, 'skills'),
      remove: list(skills.remove, 'skills.remove'),
    },
    attacks: operations(changes.attacks, 'attacks'),
    text: { set: setOf(changes.text, 'text') },
    inventory: operations(changes.inventory, 'inventory'),
    currency: { set: setOf(changes.currency, 'currency') },
    issues,
  }

  if (problems.length > 0) {
    return {
      kind: 'rejected',
      message: `The update document has a problem: ${problems[0]} Generate it again with the current update prompt.`,
    }
  }
  return { kind: 'parsed', update, ignored }
}

// ---------------------------------------------------------------------------------------------
// Resolving the update against the current character
// ---------------------------------------------------------------------------------------------

export type CurrentCharacter = {
  character: CharacterSummary
  sheet: CharacterSheet
  items: CharacterItem[]
}

export type UpdateSection =
  | 'details'
  | 'vitals'
  | 'abilities'
  | 'saving_throws'
  | 'skills'
  | 'attacks'
  | 'text'
  | 'inventory'
  | 'currency'

type Effect =
  | { type: 'detail'; field: keyof CharacterDetailsInput; value: unknown }
  | { type: 'vital'; field: keyof CharacterVitals; value: unknown }
  | { type: 'ability'; key: AbilityKey; value: unknown }
  | { type: 'save'; key: AbilityKey; on: boolean }
  | { type: 'skill'; key: SkillKey; value: SkillProficiency | null }
  | { type: 'attack-update'; id: string; field: AttackField; value: unknown }
  | { type: 'attack-add'; attack: CharacterAttack }
  | { type: 'attack-remove'; id: string }
  | { type: 'text'; field: TextField; value: unknown }
  | { type: 'item-update'; id: string; field: ItemField; value: unknown }
  | { type: 'item-add'; item: CharacterItemValues }
  | { type: 'item-remove'; id: string }
  | { type: 'coin'; coin: Denomination; value: unknown }

export type UpdateChange = {
  /** Stable for one document and one character; used for selection. */
  key: string
  section: UpdateSection
  label: string
  before: string
  after: string
  /** When set, the change cannot be selected. */
  error: string | null
  effect: Effect
}

export type ResolvedUpdate = {
  /** When set, the whole document is blocked and `changes` is empty. */
  blocked: string | null
  changes: UpdateChange[]
}

type AttackField = 'name' | 'bonus' | 'damage' | 'notes'
type TextField = 'features' | 'spells' | 'notes' | 'alignment' | 'experience'
type ItemField = 'name' | 'quantity' | 'weight' | 'description' | 'equipped' | 'attuned'

const attackFields: readonly AttackField[] = ['name', 'bonus', 'damage', 'notes']
const textFields: readonly TextField[] = ['features', 'spells', 'notes', 'alignment', 'experience']
const itemFields: readonly ItemField[] = [
  'name',
  'quantity',
  'weight',
  'description',
  'equipped',
  'attuned',
]
const detailFields = ['name', 'species', 'class_name', 'subclass', 'background', 'level'] as const
const optionalDetails = ['species', 'class_name', 'subclass', 'background'] as const
const vitalFields = ['max_hp', 'current_hp', 'temp_hp', 'armor_class', 'speed'] as const

const detailLabels: Record<(typeof detailFields)[number], string> = {
  name: 'Name',
  species: 'Species',
  class_name: 'Class',
  subclass: 'Subclass',
  background: 'Background',
  level: 'Level',
}
const vitalLabels: Record<(typeof vitalFields)[number], string> = {
  max_hp: 'Maximum HP',
  current_hp: 'Current HP',
  temp_hp: 'Temporary HP',
  armor_class: 'Armor class',
  speed: 'Speed',
}
const textLabels: Record<TextField, string> = {
  features: 'Features',
  spells: 'Spells',
  notes: 'Notes',
  alignment: 'Alignment',
  experience: 'Experience',
}
const attackLabels: Record<AttackField, string> = {
  name: 'Name',
  bonus: 'Bonus',
  damage: 'Damage',
  notes: 'Notes',
}
const itemLabels: Record<ItemField, string> = {
  name: 'Name',
  quantity: 'Quantity',
  weight: 'Weight',
  description: 'Description',
  equipped: 'Equipped',
  attuned: 'Attuned',
}
const coinLabels: Record<Denomination, string> = { cp: 'Copper', sp: 'Silver', gp: 'Gold' }

const none = '—'

function show(value: unknown): string {
  if (value === null || value === undefined || value === '') return none
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

/** Long text is shortened in the review; the full value is applied. */
function brief(value: unknown): string {
  const text = show(value)
  return text.length > 120 ? `${text.slice(0, 117)}…` : text
}

function currentDetails(character: CharacterSummary): CharacterDetailsInput {
  return {
    name: character.name,
    species: character.species ?? '',
    class_name: character.class_name ?? '',
    subclass: character.subclass ?? '',
    background: character.background ?? '',
    level: character.level,
  }
}

function itemInput(item: CharacterItem): CharacterItemInput {
  return {
    name: item.name,
    quantity: item.quantity,
    weight: item.weight === null ? '' : String(item.weight),
    description: item.description ?? '',
    equipped: item.equipped,
    attuned: item.attuned,
  }
}

function isInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

type ResolveOptions = { newId?: () => string }

/**
 * Turns an update into reviewable changes against the character as it is now. Unknown targets
 * and reported issues block the whole document; a single invalid value only disables its own
 * change. Values equal to what is stored are not changes.
 */
export function resolveUpdate(
  update: CharacterUpdate,
  current: CurrentCharacter,
  options: ResolveOptions = {},
): ResolvedUpdate {
  const newId = options.newId ?? (() => crypto.randomUUID())
  const blocks: string[] = []
  const changes: UpdateChange[] = []
  const body = current.sheet.sheet

  if (update.issues.length > 0) {
    return {
      blocked: `The assistant reported problems with this update: ${update.issues.join(' ')}`,
      changes: [],
    }
  }

  const push = (change: UpdateChange) => changes.push(change)

  // Details.
  const details = currentDetails(current.character)
  const detailSet = new Set<string>()
  for (const [field, value] of Object.entries(update.details.set)) {
    if (!(detailFields as readonly string[]).includes(field)) {
      blocks.push(`“${field}” isn’t a character detail.`)
      continue
    }
    const key = field as (typeof detailFields)[number]
    detailSet.add(key)
    let error: string | null = null
    let next: string | number = ''
    if (key === 'level') {
      if (isInt(value)) next = value
      else error = 'Level must be a whole number.'
    } else if (typeof value === 'string') {
      next = value.trim()
    } else if (value === null && key !== 'name') {
      next = ''
    } else {
      error = `${detailLabels[key]} must be text.`
    }
    if (!error) error = validateCharacterDetails({ ...details, [key]: next })[key] ?? null
    const stored = details[key]
    if (!error && next === (typeof stored === 'string' ? stored.trim() : stored)) continue
    push({
      key: `details.${key}`,
      section: 'details',
      label: detailLabels[key],
      before: show(stored),
      after: error ? brief(value) : show(next),
      error,
      effect: { type: 'detail', field: key, value: error ? value : next },
    })
  }
  for (const field of update.details.clear) {
    if (!(optionalDetails as readonly unknown[]).includes(field)) {
      blocks.push(`“${String(field)}” can’t be cleared.`)
      continue
    }
    const key = field as (typeof optionalDetails)[number]
    if (detailSet.has(key)) {
      blocks.push(`“${key}” is both set and cleared.`)
      continue
    }
    if (details[key] === '') continue
    push({
      key: `details.${key}`,
      section: 'details',
      label: detailLabels[key],
      before: show(details[key]),
      after: 'Cleared',
      error: null,
      effect: { type: 'detail', field: key, value: '' },
    })
  }

  // Vitals.
  const currentVitals: CharacterVitals = {
    max_hp: current.sheet.max_hp,
    current_hp: current.sheet.current_hp,
    temp_hp: current.sheet.temp_hp,
    armor_class: current.sheet.armor_class,
    speed: current.sheet.speed,
  }
  for (const [field, value] of Object.entries(update.vitals.set)) {
    if (!(vitalFields as readonly string[]).includes(field)) {
      blocks.push(`“${field}” isn’t a vital.`)
      continue
    }
    const key = field as (typeof vitalFields)[number]
    let error: string | null
    if (!(isInt(value) || (value === null && key !== 'temp_hp'))) {
      error = `${vitalLabels[key]} must be a whole number${key === 'temp_hp' ? '' : ' or empty'}.`
    } else {
      // Checked on its own: the relation between current and maximum HP is checked when the
      // selected changes are combined.
      const alone: CharacterVitals = {
        max_hp: null,
        current_hp: null,
        temp_hp: 0,
        armor_class: null,
        speed: null,
      }
      ;(alone as Record<string, unknown>)[key] = value
      error = validateVitals(alone)[key] ?? null
    }
    if (!error && value === currentVitals[key]) continue
    push({
      key: `vitals.${key}`,
      section: 'vitals',
      label: vitalLabels[key],
      before: show(currentVitals[key]),
      after: show(value),
      error,
      effect: { type: 'vital', field: key, value },
    })
  }

  // Ability scores.
  for (const [field, value] of Object.entries(update.abilities.set)) {
    if (!abilityKeys.includes(field as AbilityKey)) {
      blocks.push(`“${field}” isn’t an ability.`)
      continue
    }
    const key = field as AbilityKey
    const error =
      isInt(value) && value >= limits.abilityMin && value <= limits.abilityMax
        ? null
        : 'Ability scores must be whole numbers between 1 and 30.'
    if (!error && value === body.abilities[key]) continue
    push({
      key: `abilities.${key}`,
      section: 'abilities',
      label: abilityLabels[key],
      before: show(body.abilities[key]),
      after: show(value),
      error,
      effect: { type: 'ability', key, value },
    })
  }

  // Saving throws.
  const addedSaves = new Set<unknown>()
  for (const value of update.saving_throws.add) {
    if (!abilityKeys.includes(value as AbilityKey)) {
      blocks.push(`“${String(value)}” isn’t an ability.`)
      continue
    }
    addedSaves.add(value)
    if (body.saving_throws.includes(value as AbilityKey)) continue
    const key = value as AbilityKey
    push({
      key: `saving_throws.add.${key}`,
      section: 'saving_throws',
      label: `${abilityLabels[key]} saving throw`,
      before: 'Not proficient',
      after: 'Proficient',
      error: null,
      effect: { type: 'save', key, on: true },
    })
  }
  for (const value of update.saving_throws.remove) {
    if (!abilityKeys.includes(value as AbilityKey)) {
      blocks.push(`“${String(value)}” isn’t an ability.`)
      continue
    }
    if (addedSaves.has(value)) {
      blocks.push(`The ${String(value)} saving throw is both added and removed.`)
      continue
    }
    const key = value as AbilityKey
    if (!body.saving_throws.includes(key)) continue
    push({
      key: `saving_throws.remove.${key}`,
      section: 'saving_throws',
      label: `${abilityLabels[key]} saving throw`,
      before: 'Proficient',
      after: 'Not proficient',
      error: null,
      effect: { type: 'save', key, on: false },
    })
  }

  // Skills.
  const setSkills = new Set<string>()
  for (const [field, value] of Object.entries(update.skills.set)) {
    if (!skillKeys.includes(field as SkillKey)) {
      blocks.push(`“${field}” isn’t a skill.`)
      continue
    }
    setSkills.add(field)
    const key = field as SkillKey
    const error =
      value === 'proficient' || value === 'expertise'
        ? null
        : 'A skill must be “proficient” or “expertise”.'
    if (!error && value === body.skills[key]) continue
    push({
      key: `skills.set.${key}`,
      section: 'skills',
      label: skillLabels[key],
      before: show(body.skills[key] ?? 'Not proficient'),
      after: show(value),
      error,
      effect: { type: 'skill', key, value: error ? null : (value as SkillProficiency) },
    })
  }
  for (const value of update.skills.remove) {
    if (!skillKeys.includes(value as SkillKey)) {
      blocks.push(`“${String(value)}” isn’t a skill.`)
      continue
    }
    if (setSkills.has(value as string)) {
      blocks.push(`The ${String(value)} skill is both set and removed.`)
      continue
    }
    const key = value as SkillKey
    if (!body.skills[key]) continue
    push({
      key: `skills.remove.${key}`,
      section: 'skills',
      label: skillLabels[key],
      before: show(body.skills[key]),
      after: 'Not proficient',
      error: null,
      effect: { type: 'skill', key, value: null },
    })
  }

  // Attacks.
  const attackById = new Map(body.attacks.map((attack) => [attack.id, attack]))
  const touchedAttacks = new Set<string>()
  update.attacks.forEach((op, index) => {
    if (op.op === 'add') {
      const unknown = Object.keys(op.entry).filter(
        (key) => key !== 'id' && !(attackFields as readonly string[]).includes(key),
      )
      if (unknown.length > 0) {
        blocks.push(`An added attack has an unknown field “${unknown[0]}”.`)
        return
      }
      const attack: CharacterAttack = { id: newId(), name: '', bonus: '', damage: '', notes: '' }
      const errors: string[] = []
      for (const field of attackFields) {
        const value = op.entry[field]
        if (value === undefined) continue
        const error = attackValueError(field, value)
        if (error) errors.push(error)
        else attack[field] = value as string
      }
      push({
        key: `attacks.add.${index}`,
        section: 'attacks',
        label: 'New attack',
        before: none,
        after:
          [attack.name, attack.bonus, attack.damage].filter(Boolean).join(' · ') ||
          'Unnamed attack',
        error: errors[0] ?? null,
        effect: { type: 'attack-add', attack },
      })
      return
    }
    const id = typeof op.id === 'string' ? op.id : null
    const target = id ? attackById.get(id) : undefined
    if (!id || !target) {
      blocks.push('The update refers to an attack that isn’t on this character.')
      return
    }
    if (touchedAttacks.has(id)) {
      blocks.push(`The attack “${target.name || 'Unnamed attack'}” is changed more than once.`)
      return
    }
    touchedAttacks.add(id)
    const name = target.name || 'Unnamed attack'
    if (op.op === 'remove') {
      push({
        key: `attacks.remove.${id}`,
        section: 'attacks',
        label: `Attack “${name}”`,
        before: [target.bonus, target.damage].filter(Boolean).join(' · ') || 'Attack',
        after: 'Removed',
        error: null,
        effect: { type: 'attack-remove', id },
      })
      return
    }
    for (const [field, value] of Object.entries(op.set)) {
      if (!(attackFields as readonly string[]).includes(field)) {
        blocks.push(`“${field}” isn’t an attack field.`)
        continue
      }
      const key = field as AttackField
      const error = attackValueError(key, value)
      if (!error && value === target[key]) continue
      push({
        key: `attacks.update.${id}.${key}`,
        section: 'attacks',
        label: `Attack “${name}”: ${attackLabels[key]}`,
        before: show(target[key]),
        after: brief(value),
        error,
        effect: { type: 'attack-update', id, field: key, value },
      })
    }
  })

  // Free text and experience.
  for (const [field, value] of Object.entries(update.text.set)) {
    if (!(textFields as readonly string[]).includes(field)) {
      blocks.push(`“${field}” isn’t a text field.`)
      continue
    }
    const key = field as TextField
    let error: string | null = null
    if (key === 'experience') {
      if (!(value === null || (isInt(value) && value >= 0 && value <= limits.experienceMax))) {
        error = 'Experience must be between 0 and 1,000,000.'
      }
    } else if (typeof value !== 'string') {
      error = `${textLabels[key]} must be text.`
    } else if (value.length > (key === 'alignment' ? limits.alignment : limits.text)) {
      error = `${textLabels[key]} is too long.`
    }
    if (!error && value === body[key]) continue
    push({
      key: `text.${key}`,
      section: 'text',
      label: textLabels[key],
      before: brief(body[key]),
      after: brief(value),
      error,
      effect: { type: 'text', field: key, value },
    })
  }

  // Inventory.
  const itemById = new Map(current.items.map((item) => [item.id, item]))
  const touchedItems = new Set<string>()
  update.inventory.forEach((op, index) => {
    if (op.op === 'add') {
      const unknown = Object.keys(op.entry).filter(
        (key) => key !== 'id' && !(itemFields as readonly string[]).includes(key),
      )
      if (unknown.length > 0) {
        blocks.push(`An added item has an unknown field “${unknown[0]}”.`)
        return
      }
      const input = itemEntryInput(op.entry)
      const error = input.error ?? firstError(validateItemInput(input.value))
      const values = error ? null : normalizeItemInput(input.value)
      push({
        key: `inventory.add.${index}`,
        section: 'inventory',
        label: 'New item',
        before: none,
        after: `${input.value.name.trim() || 'Unnamed item'} × ${input.value.quantity}`,
        error,
        effect: {
          type: 'item-add',
          item: values ?? {
            name: input.value.name,
            quantity: input.value.quantity,
            weight: null,
            description: null,
            equipped: false,
            attuned: false,
          },
        },
      })
      return
    }
    const id = typeof op.id === 'string' ? op.id : null
    const target = id ? itemById.get(id) : undefined
    if (!id || !target) {
      blocks.push('The update refers to an item that isn’t on this character.')
      return
    }
    if (touchedItems.has(id)) {
      blocks.push(`The item “${target.name}” is changed more than once.`)
      return
    }
    touchedItems.add(id)
    if (op.op === 'remove') {
      push({
        key: `inventory.remove.${id}`,
        section: 'inventory',
        label: `Item “${target.name}”`,
        before: `${target.quantity}`,
        after: 'Removed',
        error: null,
        effect: { type: 'item-remove', id },
      })
      return
    }
    for (const [field, value] of Object.entries(op.set)) {
      if (!(itemFields as readonly string[]).includes(field)) {
        blocks.push(`“${field}” isn’t an item field.`)
        continue
      }
      const key = field as ItemField
      const merged = itemEntryInput({ ...rawItem(target), [key]: value })
      const error =
        merged.error ??
        (validateItemInput(merged.value) as Record<string, string | undefined>)[key] ??
        null
      const stored = rawItem(target)[key]
      if (!error && value === stored) continue
      push({
        key: `inventory.update.${id}.${key}`,
        section: 'inventory',
        label: `Item “${target.name}”: ${itemLabels[key]}`,
        before: show(stored),
        after: brief(value),
        error,
        effect: { type: 'item-update', id, field: key, value },
      })
    }
  })

  // Coins (target balances).
  const purse: CharacterPurse = { cp: current.sheet.cp, sp: current.sheet.sp, gp: current.sheet.gp }
  for (const [field, value] of Object.entries(update.currency.set)) {
    if (!(denominations as readonly string[]).includes(field)) {
      blocks.push(
        `“${field}” isn’t supported. Coins are copper, silver, and gold; convert other coins first.`,
      )
      continue
    }
    const coin = field as Denomination
    const error =
      isInt(value) && value >= 0 && value <= inventoryLimits.coinMax
        ? null
        : 'Enter a whole number up to 9,999,999.'
    if (!error && value === purse[coin]) continue
    push({
      key: `currency.${coin}`,
      section: 'currency',
      label: coinLabels[coin],
      before: show(purse[coin]),
      after: show(value),
      error,
      effect: { type: 'coin', coin, value },
    })
  }

  if (blocks.length > 0) {
    return { blocked: `${blocks[0]} The update can’t be applied as written.`, changes: [] }
  }
  return { blocked: null, changes }
}

function attackValueError(field: AttackField, value: unknown): string | null {
  if (typeof value !== 'string') return `Attack ${field} must be text.`
  const max = {
    name: limits.attackName,
    bonus: limits.attackBonus,
    damage: limits.attackDamage,
    notes: limits.attackNotes,
  }[field]
  return value.length > max ? `Attack ${field} can be up to ${max} characters.` : null
}

function firstError(errors: Record<string, string | undefined>): string | null {
  return Object.values(errors).find(Boolean) ?? null
}

function rawItem(item: CharacterItem): Record<ItemField, unknown> {
  return {
    name: item.name,
    quantity: item.quantity,
    weight: item.weight,
    description: item.description,
    equipped: item.equipped,
    attuned: item.attuned,
  }
}

/** Reads loosely typed item fields into the form shape, reporting wrong types. */
function itemEntryInput(entry: Rec): { value: CharacterItemInput; error: string | null } {
  let error: string | null = null
  const fail = (message: string) => {
    error ??= message
  }
  const value: CharacterItemInput = {
    name: '',
    quantity: 1,
    weight: '',
    description: '',
    equipped: false,
    attuned: false,
  }
  if (typeof entry.name === 'string') value.name = entry.name
  else fail('Item names must be text.')
  if (entry.quantity !== undefined) {
    if (isInt(entry.quantity)) value.quantity = entry.quantity
    else fail('Quantity must be a whole number.')
  }
  if (entry.weight !== undefined && entry.weight !== null) {
    if (typeof entry.weight === 'number' && Number.isFinite(entry.weight)) {
      value.weight = String(entry.weight)
    } else {
      fail('Weight must be a number or empty.')
    }
  }
  if (entry.description !== undefined && entry.description !== null) {
    if (typeof entry.description === 'string') value.description = entry.description
    else fail('Descriptions must be text.')
  }
  for (const flag of ['equipped', 'attuned'] as const) {
    if (entry[flag] !== undefined) {
      if (typeof entry[flag] === 'boolean') value[flag] = entry[flag]
      else fail(`${itemLabels[flag]} must be yes or no.`)
    }
  }
  return { value, error }
}

// ---------------------------------------------------------------------------------------------
// Building the database payload from the selected changes
// ---------------------------------------------------------------------------------------------

export type ExpectedVersions = {
  character_updated_at: string
  sheet_updated_at: string
  items: Record<string, string>
}

export type UpdatePayload = {
  details?: Record<string, string | number | null>
  vitals?: Partial<CharacterVitals>
  sheet?: CharacterSheetBody
  items?: {
    add?: CharacterItemValues[]
    update?: Array<{ id: string } & Partial<CharacterItemValues>>
    remove?: string[]
  }
  coins?: Partial<CharacterPurse>
  change_count: number
}

export type UpdatePayloadResult =
  { ok: true; changes: UpdatePayload; expected: ExpectedVersions } | { ok: false; errors: string[] }

/** The versions the review was built from, checked again by the database on apply. */
export function toExpectedVersions(current: CurrentCharacter): ExpectedVersions {
  return {
    character_updated_at: current.character.updated_at,
    sheet_updated_at: current.sheet.updated_at,
    items: Object.fromEntries(current.items.map((item) => [item.id, item.updated_at])),
  }
}

/**
 * Combines the selected changes into one `apply_character_update` payload and checks the
 * combination (for example current HP against maximum HP and the item cap). Changes with an
 * error cannot be applied.
 */
export function toUpdatePayload(
  selected: UpdateChange[],
  current: CurrentCharacter,
): UpdatePayloadResult {
  if (selected.length === 0) return { ok: false, errors: ['Select at least one change.'] }
  const errors: string[] = []
  for (const change of selected) {
    if (change.error) errors.push(`${change.label}: ${change.error}`)
  }
  if (errors.length > 0) return { ok: false, errors }

  const details = currentDetails(current.character)
  const detailChanges: Partial<Record<keyof CharacterDetailsInput, string | number>> = {}
  const vitals: CharacterVitals = {
    max_hp: current.sheet.max_hp,
    current_hp: current.sheet.current_hp,
    temp_hp: current.sheet.temp_hp,
    armor_class: current.sheet.armor_class,
    speed: current.sheet.speed,
  }
  const vitalChanges: Partial<CharacterVitals> = {}
  const body = normalizeSheet(current.sheet.sheet)
  body.attacks = body.attacks.map((attack) => ({ ...attack }))
  let sheetChanged = false
  const itemAdds: CharacterItemValues[] = []
  const itemRemoves: string[] = []
  const itemEdits = new Map<string, Partial<CharacterItemInput>>()
  const coins: Partial<CharacterPurse> = {}

  for (const { effect } of selected) {
    switch (effect.type) {
      case 'detail': {
        const value = effect.value as string | number
        detailChanges[effect.field] = value
        ;(details as Record<string, unknown>)[effect.field] = value
        break
      }
      case 'vital':
        ;(vitals as Record<string, unknown>)[effect.field] = effect.value
        ;(vitalChanges as Record<string, unknown>)[effect.field] = effect.value
        break
      case 'ability':
        body.abilities[effect.key] = effect.value as number
        sheetChanged = true
        break
      case 'save': {
        const next = new Set(body.saving_throws)
        if (effect.on) next.add(effect.key)
        else next.delete(effect.key)
        body.saving_throws = abilityKeys.filter((key) => next.has(key))
        sheetChanged = true
        break
      }
      case 'skill':
        if (effect.value) body.skills[effect.key] = effect.value
        else delete body.skills[effect.key]
        sheetChanged = true
        break
      case 'attack-update': {
        const attack = body.attacks.find((entry) => entry.id === effect.id)
        if (attack) attack[effect.field] = effect.value as string
        sheetChanged = true
        break
      }
      case 'attack-add':
        body.attacks.push({ ...effect.attack })
        sheetChanged = true
        break
      case 'attack-remove':
        body.attacks = body.attacks.filter((entry) => entry.id !== effect.id)
        sheetChanged = true
        break
      case 'text':
        ;(body as unknown as Record<string, unknown>)[effect.field] = effect.value
        sheetChanged = true
        break
      case 'item-add':
        itemAdds.push(effect.item)
        break
      case 'item-remove':
        itemRemoves.push(effect.id)
        break
      case 'item-update': {
        const edit = itemEdits.get(effect.id) ?? {}
        ;(edit as Record<string, unknown>)[effect.field] =
          effect.field === 'weight'
            ? effect.value === null
              ? ''
              : String(effect.value)
            : effect.value
        itemEdits.set(effect.id, edit)
        break
      }
      case 'coin':
        coins[effect.coin] = effect.value as number
        break
    }
  }

  // Combined checks.
  if (Object.keys(detailChanges).length > 0) {
    errors.push(...Object.values(validateCharacterDetails(details)))
  }
  if (Object.keys(vitalChanges).length > 0) errors.push(...Object.values(validateVitals(vitals)))
  if (sheetChanged) errors.push(...validateSheetBody(body))

  const itemUpdates: Array<{ id: string } & Partial<CharacterItemValues>> = []
  for (const [id, edit] of itemEdits) {
    const stored = current.items.find((item) => item.id === id)
    if (!stored) continue
    const merged = { ...itemInput(stored), ...edit }
    errors.push(...Object.values(validateItemInput(merged)).filter((m): m is string => Boolean(m)))
    const values = normalizeItemInput(merged)
    const update: { id: string } & Partial<CharacterItemValues> = { id }
    for (const field of Object.keys(edit) as ItemField[]) {
      ;(update as Record<string, unknown>)[field] = values[field]
    }
    itemUpdates.push(update)
  }
  if (current.items.length - itemRemoves.length + itemAdds.length > inventoryLimits.items) {
    errors.push(`A character can carry up to ${inventoryLimits.items} items.`)
  }
  if (errors.length > 0) return { ok: false, errors: [...new Set(errors)] }

  const changes: UpdatePayload = { change_count: selected.length }
  if (Object.keys(detailChanges).length > 0) {
    const payload: Record<string, string | number | null> = {}
    for (const field of Object.keys(detailChanges) as Array<keyof CharacterDetailsInput>) {
      const value = detailChanges[field]
      if (field === 'level') payload[field] = value as number
      else if (field === 'name') payload[field] = String(value).trim()
      else payload[field] = String(value).trim() || null
    }
    changes.details = payload
  }
  if (Object.keys(vitalChanges).length > 0) changes.vitals = vitalChanges
  if (sheetChanged) changes.sheet = body
  if (itemAdds.length + itemUpdates.length + itemRemoves.length > 0) {
    changes.items = {}
    if (itemAdds.length > 0) changes.items.add = itemAdds
    if (itemUpdates.length > 0) changes.items.update = itemUpdates
    if (itemRemoves.length > 0) changes.items.remove = itemRemoves
  }
  if (Object.keys(coins).length > 0) changes.coins = coins
  return { ok: true, changes, expected: toExpectedVersions(current) }
}
