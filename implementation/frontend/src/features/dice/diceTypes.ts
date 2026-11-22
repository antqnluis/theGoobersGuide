/** Dice roll specification and results (M03.7 §5.1). */

export type DiceKeep = { mode: 'high' | 'low'; count: number }

export type DiceTerm =
  | { kind: 'dice'; sign: 1 | -1; count: number; sides: number; keep?: DiceKeep }
  | { kind: 'constant'; sign: 1 | -1; value: number }

/** What `roll_dice` receives as `p_terms` is `spec.terms`. */
export type RollSpec = { terms: DiceTerm[] }

export type RollMode = 'normal' | 'advantage' | 'disadvantage'

/** Limits shared by the client and the `roll_dice` RPC (plan §5.1, D4). */
export const diceLimits = {
  maxTerms: 20,
  maxDicePerTerm: 100,
  maxDiceTotal: 100,
  minSides: 2,
  maxSides: 1000,
  maxConstant: 10000,
} as const

/** One rolled face. A dropped die (keep highest/lowest) has `kept: false`. */
export type RolledFace = { value: number; kept: boolean }

/**
 * The outcome of a roll. `dice[i]` holds the faces of `spec.terms[i]`, in the order they were
 * rolled; it is empty for a constant term. This is the shape stored in `dice_rolls.dice`.
 */
export type RollResult = {
  spec: RollSpec
  /** The canonical expression, `formatSpec(spec)`. */
  expression: string
  dice: RolledFace[][]
  total: number
}
