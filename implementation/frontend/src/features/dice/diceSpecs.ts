import type { DiceTerm, RollSpec } from './diceTypes'

/** One die plus a modifier; a zero modifier is left out, so it reads `1d8`. */
export function dieSpec(sides: number, modifier: number): RollSpec {
  const terms: DiceTerm[] = [{ kind: 'dice', sign: 1, count: 1, sides }]
  if (modifier !== 0) {
    terms.push({ kind: 'constant', sign: modifier < 0 ? -1 : 1, value: Math.abs(modifier) })
  }
  return { terms }
}

/** `1d20` plus a modifier; a zero modifier is left out, so it reads `1d20`. */
export function d20Spec(modifier: number): RollSpec {
  return dieSpec(20, modifier)
}
