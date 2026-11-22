import type { DiceTerm, RollSpec } from './diceTypes'

/** `1d20` plus a modifier; a zero modifier is left out, so it reads `1d20`. */
export function d20Spec(modifier: number): RollSpec {
  const terms: DiceTerm[] = [{ kind: 'dice', sign: 1, count: 1, sides: 20 }]
  if (modifier !== 0) {
    terms.push({ kind: 'constant', sign: modifier < 0 ? -1 : 1, value: Math.abs(modifier) })
  }
  return { terms }
}
