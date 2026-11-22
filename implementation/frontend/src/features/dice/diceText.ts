import { parseDice, specError } from './diceNotation'
import { diceLimits, type RollSpec } from './diceTypes'

/**
 * Finding dice in prose (M03.7 §5.3). A match needs a `d` followed by a number of sides, so "+5",
 * "3d printer", and "d-day" never match. Nothing is rewritten in storage; chips are added when text
 * is displayed.
 */

const dicePart = String.raw`\d{0,4}[dD](?:\d{1,5}|%)(?:[kK][hHlL]\d{1,4})?(?!\w)`
// A flat number joins a dice expression only when it stands alone ("+ 3", not "+ 3rd" or "+ 5-foot").
const numberPart = String.raw`\d{1,6}(?!\w|-[A-Za-z])`
const diceExpression = new RegExp(
  String.raw`(?<![\w.])${dicePart}(?:[ \t]*[+-][ \t]*(?:${dicePart}|${numberPart}))*`,
  'g',
)

export type DiceMatch = { start: number; end: number; text: string; spec: RollSpec }

/** The ranges of dice notation in `text`, in order. Matches that break the dice limits are skipped. */
export function findDice(text: string): DiceMatch[] {
  const matches: DiceMatch[] = []
  for (const found of text.matchAll(diceExpression)) {
    const parsed = parseDice(found[0])
    if (!parsed.ok) continue
    matches.push({
      start: found.index,
      end: found.index + found[0].length,
      text: found[0],
      spec: parsed.spec,
    })
  }
  return matches
}

export type TextSegment =
  { kind: 'text'; text: string } | { kind: 'dice'; text: string; spec: RollSpec }

/** Splits text into plain runs and dice, so a renderer can wrap the dice in chips. Joined, the segments equal the input. */
export function splitDice(text: string): TextSegment[] {
  const segments: TextSegment[] = []
  let position = 0
  for (const match of findDice(text)) {
    if (match.start > position)
      segments.push({ kind: 'text', text: text.slice(position, match.start) })
    segments.push({ kind: 'dice', text: match.text, spec: match.spec })
    position = match.end
  }
  if (position < text.length) segments.push({ kind: 'text', text: text.slice(position) })
  return segments
}

/** "+5", "5", "-1", or "+ 5" become `1d20 + n`. Anything else, including blank, gives null. */
export function attackRollSpec(bonus: string): RollSpec | null {
  const match = /^\s*([+-])?\s*(\d{1,5})\s*$/.exec(bonus)
  if (!match) return null
  const value = Number(match[2])
  if (value > diceLimits.maxConstant) return null
  const terms: RollSpec['terms'] = [{ kind: 'dice', sign: 1, count: 1, sides: 20 }]
  if (value !== 0) {
    terms.push({ kind: 'constant', sign: match[1] === '-' ? -1 : 1, value })
  }
  return { terms }
}

export type DamageSegment = {
  /** What the damage is, from the words after the dice ("slashing"), or null. */
  label: string | null
  /** The terms of the spec this segment covers: `spec.terms.slice(start, end)`. */
  start: number
  end: number
}

export type DamageSpec = { spec: RollSpec; segments: DamageSegment[] }

const labelLimit = 40

function segmentLabel(between: string): string | null {
  const label = between
    .replace(/^[\s,;:.)\]+]+/, '')
    .replace(/\s*(?:\bplus\b|\band\b|\bor\b|\+|&|,|;|\(|\[)\s*$/i, '')
    .replace(/[\s,;:.([]+$/, '')
    .trim()
  return label === '' ? null : label.slice(0, labelLimit)
}

/**
 * Combines every dice expression in a damage field ("1d8+3 slashing plus 2d6 fire") into one spec,
 * with the words that follow each as its label. No dice, or more than the limits allow, gives null.
 */
export function damageSpec(damage: string): DamageSpec | null {
  const matches = findDice(damage)
  if (matches.length === 0) return null
  const terms: RollSpec['terms'] = []
  const segments: DamageSegment[] = []
  matches.forEach((match, index) => {
    const start = terms.length
    terms.push(...match.spec.terms)
    const next = matches[index + 1]
    segments.push({
      label: segmentLabel(damage.slice(match.end, next ? next.start : damage.length)),
      start,
      end: terms.length,
    })
  })
  const spec = { terms }
  return specError(spec) ? null : { spec, segments }
}
