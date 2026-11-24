import { d20Spec, dieSpec } from '../dice/diceSpecs'
import type { RollSpec } from '../dice/diceTypes'
import type { SheetRoll } from '../dice/RollButton'
import { parseSpells } from './spellFormat'
import {
  standardConditions,
  type CharacterResource,
  type CharacterSheet,
  type ResourceValues,
} from './characterTypes'

/** Pure rules for live resources (M04 §5). Nothing here reads or writes the database. */

export type RestKind = 'short' | 'long'

/** What a confirmed rest applies. This is exactly the `p_plan` the RPC receives (L5). */
export type RestPlan = {
  hp?: 'max' | number
  temp_hp?: number
  resources?: { id: string; current: number }[]
  /** A change to the level, not the new level. */
  exhaustion?: number
  clear_death_saves?: boolean
}

type RestSheet = Pick<
  CharacterSheet,
  | 'max_hp'
  | 'current_hp'
  | 'temp_hp'
  | 'exhaustion'
  | 'death_save_successes'
  | 'death_save_failures'
>

/**
 * Hit dice a long rest gives back by default: half the total, at least one, largest dice first.
 * Rows set to never reset are left alone. The player can change every line before applying.
 */
function hitDiceRegained(hitDice: CharacterResource[]) {
  const rows = hitDice
    .filter((row) => row.reset !== 'none')
    .sort((a, b) => (b.die ?? 0) - (a.die ?? 0) || a.position - b.position)
  const total = rows.reduce((sum, row) => sum + row.maximum, 0)
  let remaining = Math.max(1, Math.floor(total / 2))
  const changes: { id: string; current: number }[] = []
  for (const row of rows) {
    const take = Math.min(row.maximum - row.current, remaining)
    if (take <= 0) continue
    changes.push({ id: row.id, current: row.current + take })
    remaining -= take
  }
  return changes
}

/**
 * The default plan for a rest: only what would actually change, so the dialog can list it.
 * Short rest: trackers that reset on a short rest go to their maximum. Long rest: HP to
 * maximum, temporary HP to 0, trackers that reset on a short or long rest to their maximum,
 * half the hit dice back, one level of exhaustion off, and death saves cleared. Hit dice spent
 * during a short rest are applied one at a time, not here.
 */
export function restPreview(
  sheet: RestSheet,
  resources: CharacterResource[],
  kind: RestKind,
): RestPlan {
  const plan: RestPlan = {}
  const refills: { id: string; current: number }[] = resources
    .filter(
      (row) =>
        row.kind !== 'hit_dice' &&
        row.current < row.maximum &&
        (row.reset === 'short' || (kind === 'long' && row.reset === 'long')),
    )
    .map((row) => ({ id: row.id, current: row.maximum }))

  if (kind === 'long') {
    if (sheet.max_hp !== null && sheet.current_hp !== sheet.max_hp) plan.hp = 'max'
    if (sheet.temp_hp > 0) plan.temp_hp = 0
    if (sheet.exhaustion > 0) plan.exhaustion = -1
    if (sheet.death_save_successes > 0 || sheet.death_save_failures > 0) {
      plan.clear_death_saves = true
    }
    refills.push(...hitDiceRegained(resources.filter((row) => row.kind === 'hit_dice')))
  }
  if (refills.length > 0) plan.resources = refills
  return plan
}

export function isEmptyRestPlan(plan: RestPlan) {
  return Object.keys(plan).length === 0
}

/** The save DC for keeping concentration after damage (L9). */
export function concentrationDc(damage: number) {
  return Math.max(10, Math.floor(damage / 2))
}

/** One hit die plus the Constitution modifier (L6). */
export function hitDieRoll(die: number, conModifier: number): RollSpec {
  return dieSpec(die, conModifier)
}

/** What a hit die heals: the total, never below zero. */
export function hitDieHealing(total: number) {
  return Math.max(0, total)
}

/** A hit die rolled from the rest dialog, shared to the log like any sheet roll. */
export function hitDieSheetRoll(die: number, conModifier: number, characterId: string): SheetRoll {
  return {
    label: 'Hit die',
    spec: hitDieRoll(die, conModifier),
    source: 'tray',
    characterId,
  }
}

export function deathSaveRoll(characterId: string): SheetRoll {
  return { label: 'Death save', spec: d20Spec(0), source: 'save', characterId }
}

export type DeathSaveResult = 'success' | 'failure' | 'critical_success' | 'critical_failure'

/** A death save from the natural d20: 20 revives, 1 counts twice, 10 or more succeeds (L7). */
export function deathSaveOutcome(natural: number): DeathSaveResult {
  if (natural >= 20) return 'critical_success'
  if (natural <= 1) return 'critical_failure'
  return natural >= 10 ? 'success' : 'failure'
}

export type HpKind = 'damage' | 'heal' | 'temp'

export type HpState = Pick<
  CharacterSheet,
  'max_hp' | 'current_hp' | 'temp_hp' | 'death_save_successes' | 'death_save_failures'
>

/**
 * The result of one HP tap, with the same rules as `apply_character_hp` (L3). The screen uses
 * it to show the change at once; the server's answer replaces it. Null when HP is not set,
 * where damage and healing do nothing (temporary HP still work).
 */
export function hpAfter(
  state: HpState,
  kind: HpKind,
  amount: number,
): (HpState & { damage_taken: number }) | null {
  const { max_hp, current_hp } = state
  let temp = state.temp_hp
  let current = current_hp ?? 0
  let successes = state.death_save_successes
  let failures = state.death_save_failures
  let taken = 0

  if (kind === 'temp') {
    temp = Math.max(temp, amount)
  } else {
    if (max_hp === null || current_hp === null) return null
    if (kind === 'damage') {
      const absorbed = Math.min(temp, amount)
      temp -= absorbed
      taken = amount - absorbed
      if (taken > 0) {
        if (current === 0) failures = Math.min(3, failures + 1)
        current = Math.max(0, current - taken)
      }
    } else {
      if (current === 0) {
        successes = 0
        failures = 0
      }
      current = Math.min(max_hp, current + amount)
    }
  }
  return {
    max_hp,
    current_hp: current_hp === null ? null : current,
    temp_hp: temp,
    death_save_successes: successes,
    death_save_failures: failures,
    damage_taken: taken,
  }
}

const ordinals = ['th', 'st', 'nd', 'rd']
export function ordinal(value: number) {
  const mod100 = value % 100
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`
  return `${value}${ordinals[value % 10] ?? 'th'}`
}

/** The name a tracker is shown under. */
export function resourceLabel(resource: CharacterResource) {
  if (resource.kind === 'spell_slots') {
    const level = `${ordinal(resource.slot_level ?? 1)} level`
    return resource.name ? `${resource.name} (${level})` : `${level} slots`
  }
  if (resource.kind === 'hit_dice') {
    const die = `d${resource.die}`
    return resource.name ? `${resource.name} (${die})` : `${die} hit dice`
  }
  return resource.name ?? 'Tracker'
}

export type ResourceGroups = {
  spellSlots: CharacterResource[]
  hitDice: CharacterResource[]
  features: CharacterResource[]
}

/** Splits the trackers into the three groups the sheet shows, each in its display order. */
export function groupResources(resources: CharacterResource[]): ResourceGroups {
  const byPosition = (a: CharacterResource, b: CharacterResource) =>
    a.position - b.position || a.created_at.localeCompare(b.created_at)
  return {
    spellSlots: resources
      .filter((row) => row.kind === 'spell_slots')
      .sort((a, b) => (a.slot_level ?? 0) - (b.slot_level ?? 0) || byPosition(a, b)),
    hitDice: resources
      .filter((row) => row.kind === 'hit_dice')
      .sort((a, b) => (b.die ?? 0) - (a.die ?? 0) || byPosition(a, b)),
    features: resources.filter((row) => row.kind === 'tracker').sort(byPosition),
  }
}

// --- Conditions (L8) ---------------------------------------------------------------------

const standardByKey = new Map(standardConditions.map((entry) => [entry.key as string, entry]))

/** What is stored for a typed condition: the standard key when it names one, else the text. */
export function normalizeCondition(text: string) {
  const trimmed = text.trim()
  return standardByKey.has(trimmed.toLowerCase()) ? trimmed.toLowerCase() : trimmed
}

export function conditionLabel(stored: string) {
  return standardByKey.get(stored.toLowerCase())?.label ?? stored
}

/** The one-line reminder for a standard condition, or null for a custom one. */
export function conditionReminder(stored: string) {
  return standardByKey.get(stored.toLowerCase())?.reminder ?? null
}

// --- Suggestions (L11): only what the sheet already says, never guessed ---------------------

export type ResourceSuggestion = {
  id: string
  label: string
  values: ResourceValues
}

/** Spell slots from headings like "1st level (4 slots)" that are not tracked yet. */
export function suggestSpellSlots(
  spellsText: string,
  existing: CharacterResource[],
): ResourceSuggestion[] {
  const tracked = new Set(
    existing
      .filter((row) => row.kind === 'spell_slots' && row.name === null)
      .map((row) => row.slot_level),
  )
  const seen = new Set<number>()
  const suggestions: ResourceSuggestion[] = []
  for (const block of parseSpells(spellsText)) {
    if (block.kind !== 'group' || !block.mark || !block.slots) continue
    const level = /^[1-9]$/.test(block.mark) ? Number(block.mark) : 0
    const count = /\d+/.exec(block.slots)
    if (level === 0 || !count || tracked.has(level) || seen.has(level)) continue
    const maximum = Number(count[0])
    if (maximum < 1 || maximum > 999) continue
    seen.add(level)
    suggestions.push({
      id: `slots-${level}`,
      label: `${ordinal(level)} level: ${maximum} ${maximum === 1 ? 'slot' : 'slots'}`,
      values: {
        kind: 'spell_slots',
        name: null,
        slot_level: level,
        die: null,
        maximum,
        current: maximum,
        reset: 'long',
        position: 0,
      },
    })
  }
  return suggestions.sort((a, b) => (a.values.slot_level ?? 0) - (b.values.slot_level ?? 0))
}

/** Hit die size by class, for the classes whose die never varies. */
const classHitDie: Record<string, number> = {
  artificer: 8,
  barbarian: 12,
  bard: 8,
  cleric: 8,
  druid: 8,
  fighter: 10,
  monk: 8,
  paladin: 10,
  ranger: 10,
  rogue: 8,
  sorcerer: 6,
  warlock: 8,
  wizard: 6,
}

/** Hit dice from a single class name it recognises and the level, unless that die is tracked. */
export function suggestHitDice(
  className: string | null,
  level: number,
  existing: CharacterResource[],
): ResourceSuggestion[] {
  const die = className ? classHitDie[className.trim().toLowerCase()] : undefined
  if (!die || !Number.isInteger(level) || level < 1 || level > 20) return []
  if (existing.some((row) => row.kind === 'hit_dice' && row.die === die)) return []
  return [
    {
      id: `hit-dice-${die}`,
      label: `${level} d${die} hit ${level === 1 ? 'die' : 'dice'}`,
      values: {
        kind: 'hit_dice',
        name: null,
        slot_level: null,
        die,
        maximum: level,
        current: level,
        reset: 'long',
        position: 0,
      },
    },
  ]
}
