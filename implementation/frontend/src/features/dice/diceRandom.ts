import { formatSpec, specError } from './diceNotation'
import type { RolledFace, RollResult, RollSpec } from './diceTypes'

/**
 * The client roller, used only for private rolls outside a campaign (D2). Campaign rolls are made
 * by `roll_dice` in Postgres with the same rules: a uniform 32-bit draw per attempt, a draw from the
 * biased tail is rejected and redrawn, and ties when keeping dice go to the earliest die.
 */

/** Returns a uniform unsigned 32-bit integer. */
export type RandomSource = () => number

export const cryptoSource: RandomSource = () => {
  const buffer = new Uint32Array(1)
  crypto.getRandomValues(buffer)
  return buffer[0]
}

/** A uniform integer from 1 to `sides`, by rejection sampling (no modulo bias). */
export function randomInt(sides: number, source: RandomSource = cryptoSource): number {
  if (!Number.isInteger(sides) || sides < 1 || sides > 0x10000) {
    throw new RangeError(`Cannot roll a ${sides}-sided die.`)
  }
  const limit = Math.floor(0x100000000 / sides) * sides
  for (;;) {
    const draw = source()
    if (draw < limit) return (draw % sides) + 1
  }
}

/** Marks which faces a keep-highest or keep-lowest term keeps. Ties keep the earliest die. */
export function markKept(
  values: number[],
  keep: { mode: 'high' | 'low'; count: number } | undefined,
): RolledFace[] {
  if (!keep) return values.map((value) => ({ value, kept: true }))
  const order = values
    .map((value, index) => ({ value, index }))
    .sort(
      (a, b) => (keep.mode === 'high' ? b.value - a.value : a.value - b.value) || a.index - b.index,
    )
  const kept = new Set(order.slice(0, keep.count).map((entry) => entry.index))
  return values.map((value, index) => ({ value, kept: kept.has(index) }))
}

/** The signed sum of a term's kept faces. */
export function keptTotal(faces: RolledFace[]): number {
  return faces.reduce((sum, face) => (face.kept ? sum + face.value : sum), 0)
}

/** Rolls a spec locally. Throws `RangeError` for a spec that breaks the shared limits. */
export function rollSpec(spec: RollSpec, source: RandomSource = cryptoSource): RollResult {
  const problem = specError(spec)
  if (problem) throw new RangeError(problem)

  let total = 0
  const dice = spec.terms.map((term): RolledFace[] => {
    if (term.kind === 'constant') {
      total += term.sign * term.value
      return []
    }
    const values = Array.from({ length: term.count }, () => randomInt(term.sides, source))
    const faces = markKept(values, term.keep)
    total += term.sign * keptTotal(faces)
    return faces
  })
  return { spec, expression: formatSpec(spec), dice, total }
}
