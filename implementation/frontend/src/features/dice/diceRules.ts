import type { Database } from '../../types/database'
import { formatSpec } from './diceNotation'
import type { DiceTerm, RolledFace, RollResult } from './diceTypes'

export type DiceSource =
  'tray' | 'ability' | 'save' | 'skill' | 'initiative' | 'attack' | 'damage' | 'text'

export type DiceVisibility = 'campaign' | 'self'

/** One roll as the app shows it: a `dice_rolls` row, or a local roll made on this device. */
export type DiceRollRecord = {
  id: string
  campaign_id: string
  roller_id: string
  character_id: string | null
  visibility: DiceVisibility
  source: DiceSource
  label: string | null
  expression: string
  terms: DiceTerm[]
  /** `dice[i]` holds the faces of `terms[i]`; empty for a constant. */
  dice: RolledFace[][]
  total: number
  created_at: string
}

type DiceRollRow = Database['public']['Tables']['dice_rolls']['Row']

export function toRollRecord(row: DiceRollRow): DiceRollRecord {
  return {
    ...row,
    visibility: row.visibility as DiceVisibility,
    source: row.source as DiceSource,
    terms: row.terms as unknown as DiceTerm[],
    dice: row.dice as unknown as RolledFace[][],
  }
}

const localPrefix = 'local-'

/** A roll made on this device: not stored, not shared, gone on reload. */
export function localRollRecord(
  result: RollResult,
  meta: { label: string | null; source: DiceSource },
): DiceRollRecord {
  return {
    id: `${localPrefix}${crypto.randomUUID()}`,
    campaign_id: '',
    roller_id: '',
    character_id: null,
    visibility: 'self',
    source: meta.source,
    label: meta.label,
    expression: result.expression || formatSpec(result.spec),
    terms: result.spec.terms,
    dice: result.dice,
    total: result.total,
    created_at: new Date().toISOString(),
  }
}

export const isLocalRoll = (roll: DiceRollRecord) => roll.id.startsWith(localPrefix)

/** What a roll is called: the label from its source, or the expression itself. */
export function rollTitle(roll: Pick<DiceRollRecord, 'label' | 'expression'>) {
  return roll.label ?? roll.expression
}

/** A roll of only constants has no dice in it (flagged "No dice" in the log). */
export function isConstantOnly(roll: Pick<DiceRollRecord, 'terms'>) {
  return roll.terms.every((term) => term.kind === 'constant')
}

export type FaceMark = 'max' | 'min' | null

/** A natural 20 or 1 on a d20; nothing for other dice. */
export function faceMark(sides: number, value: number): FaceMark {
  if (sides !== 20) return null
  if (value === 20) return 'max'
  if (value === 1) return 'min'
  return null
}

export type NaturalOutcome = 'natural-20' | 'natural-1' | null

/** The first positive d20 term's kept face, when it is a 20 or a 1 (D9). */
export function naturalOutcome(roll: Pick<DiceRollRecord, 'terms' | 'dice'>): NaturalOutcome {
  const index = roll.terms.findIndex(
    (term) => term.kind === 'dice' && term.sides === 20 && term.sign === 1,
  )
  if (index < 0) return null
  const kept = (roll.dice[index] ?? []).filter((face) => face.kept)
  if (kept.length !== 1) return null
  const mark = faceMark(20, kept[0].value)
  if (mark === 'max') return 'natural-20'
  if (mark === 'min') return 'natural-1'
  return null
}

export function announcement(who: string, roll: DiceRollRecord) {
  const natural = naturalOutcome(roll)
  const note =
    natural === 'natural-20' ? ' Natural 20.' : natural === 'natural-1' ? ' Natural 1.' : ''
  return `${who} rolled ${rollTitle(roll)}: ${roll.total}.${note}`
}

// --- The log's pages -------------------------------------------------------------------------

export type DiceLogPages = { pages: DiceRollRecord[][]; pageParams: unknown[] }

const newestFirst = (a: DiceRollRecord, b: DiceRollRecord) =>
  a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : a.id < b.id ? 1 : -1

/** Adds a roll to the first page unless the log already has it (own result and Realtime both arrive). */
export function mergeRollIntoLog(
  data: DiceLogPages | undefined,
  roll: DiceRollRecord,
): DiceLogPages | undefined {
  if (!data) return data
  if (data.pages.some((page) => page.some((entry) => entry.id === roll.id))) return data
  const [first = [], ...rest] = data.pages
  return { ...data, pages: [[roll, ...first].sort(newestFirst), ...rest] }
}

/** Every loaded roll, newest first, each once. */
export function flattenLog(data: DiceLogPages | undefined): DiceRollRecord[] {
  if (!data) return []
  const seen = new Set<string>()
  const rolls: DiceRollRecord[] = []
  for (const page of data.pages) {
    for (const roll of page) {
      if (seen.has(roll.id)) continue
      seen.add(roll.id)
      rolls.push(roll)
    }
  }
  return rolls.sort(newestFirst)
}

export type DiceMinuteGroup = { key: string; time: Date; rolls: DiceRollRecord[] }

/** Newest-first rolls grouped by the minute they were made, in the viewer's time zone. */
export function groupByMinute(rolls: readonly DiceRollRecord[]): DiceMinuteGroup[] {
  const groups: DiceMinuteGroup[] = []
  for (const roll of rolls) {
    const time = new Date(roll.created_at)
    const key = [
      time.getFullYear(),
      time.getMonth(),
      time.getDate(),
      time.getHours(),
      time.getMinutes(),
    ].join('-')
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.rolls.push(roll)
    else groups.push({ key, time, rolls: [roll] })
  }
  return groups
}
