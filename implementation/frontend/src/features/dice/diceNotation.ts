import { diceLimits, type DiceTerm, type RollMode, type RollSpec } from './diceTypes.ts'

/**
 * Dice notation (M03.7 §5.2): `NdS`, `d%`, constants, `+`/`-`, and keep highest or lowest
 * (`4d6kh3`, `2d20kl1`). The client parses; the server validates the spec itself and rebuilds the
 * canonical expression with the same rules as `formatSpec`.
 */

export type ParseResult = { ok: true; spec: RollSpec } | { ok: false; error: string; at: number }

/** The first problem with one term, or null. Messages are shown to the person typing. */
export function termError(term: DiceTerm): string | null {
  if (term.kind === 'constant') {
    if (!Number.isInteger(term.value) || Math.abs(term.value) > diceLimits.maxConstant) {
      return `Numbers go up to ${diceLimits.maxConstant}.`
    }
    return null
  }
  if (!Number.isInteger(term.count) || term.count < 1) return 'Roll at least 1 die.'
  if (term.count > diceLimits.maxDicePerTerm) {
    return `Up to ${diceLimits.maxDicePerTerm} dice at a time.`
  }
  if (
    !Number.isInteger(term.sides) ||
    term.sides < diceLimits.minSides ||
    term.sides > diceLimits.maxSides
  ) {
    return `Dice have ${diceLimits.minSides} to ${diceLimits.maxSides} sides.`
  }
  if (term.keep) {
    if (!Number.isInteger(term.keep.count) || term.keep.count < 1 || term.keep.count > term.count) {
      return `Keep between 1 and ${term.count} dice.`
    }
  }
  return null
}

/** The first problem with a whole spec (the same rules the RPC enforces), or null. */
export function specError(spec: RollSpec): string | null {
  if (spec.terms.length < 1) return 'Enter a roll, like 2d6 + 3.'
  if (spec.terms.length > diceLimits.maxTerms) {
    return `Up to ${diceLimits.maxTerms} parts in one roll.`
  }
  let dice = 0
  for (const term of spec.terms) {
    const problem = termError(term)
    if (problem) return problem
    if (term.kind === 'dice') dice += term.count
  }
  if (dice > diceLimits.maxDiceTotal) return `Up to ${diceLimits.maxDiceTotal} dice in one roll.`
  return null
}

/** The canonical form, for example `2d20kh1 + 5`. The server produces the same string. */
export function formatSpec(spec: RollSpec): string {
  return spec.terms
    .map((term, index) => {
      const body =
        term.kind === 'constant'
          ? String(term.value)
          : `${term.count}d${term.sides}${
              term.keep ? `k${term.keep.mode === 'high' ? 'h' : 'l'}${term.keep.count}` : ''
            }`
      if (index === 0) return term.sign < 0 ? `-${body}` : body
      return `${term.sign < 0 ? '-' : '+'} ${body}`
    })
    .join(' ')
}

const isDigit = (ch: string | undefined): boolean => ch !== undefined && ch >= '0' && ch <= '9'
const isSpace = (ch: string | undefined): boolean => ch === ' ' || ch === '\t' || ch === '\n'

/** Parses text such as `2d6 + 3`, `d20`, `d%`, or `4d6kh3`. Case and spacing between parts don't matter. */
export function parseDice(text: string): ParseResult {
  const fail = (error: string, at: number): ParseResult => ({ ok: false, error, at })
  const terms: DiceTerm[] = []
  let diceTotal = 0
  let i = 0

  const skipSpace = () => {
    while (isSpace(text[i])) i += 1
  }
  const readDigits = (): string => {
    const start = i
    while (isDigit(text[i])) i += 1
    return text.slice(start, i)
  }

  skipSpace()
  if (i >= text.length) return fail('Enter a roll, like 2d6 + 3.', 0)

  let sign: 1 | -1 = 1
  if (text[i] === '+' || text[i] === '-') {
    sign = text[i] === '-' ? -1 : 1
    i += 1
    skipSpace()
  }

  for (;;) {
    const start = i
    const countDigits = readDigits()
    let term: DiceTerm

    if (text[i] === 'd' || text[i] === 'D') {
      if (countDigits.length > 4)
        return fail(`Up to ${diceLimits.maxDicePerTerm} dice at a time.`, start)
      const count = countDigits === '' ? 1 : Number(countDigits)
      i += 1
      let sides: number
      if (text[i] === '%') {
        sides = 100
        i += 1
      } else if (text[i] === 'f' || text[i] === 'F') {
        return fail("Fate dice aren't supported.", i)
      } else {
        const sideDigits = readDigits()
        if (sideDigits === '') return fail('Add the number of sides after "d", like d20.', i)
        if (sideDigits.length > 5) {
          return fail(`Dice have ${diceLimits.minSides} to ${diceLimits.maxSides} sides.`, start)
        }
        sides = Number(sideDigits)
      }

      let keep: { mode: 'high' | 'low'; count: number } | undefined
      if (text[i] === 'k' || text[i] === 'K') {
        const modeAt = i + 1
        const modeChar = text[modeAt]?.toLowerCase()
        if (modeChar !== 'h' && modeChar !== 'l') {
          return fail('Keep needs "h" or "l" and a number, like kh3.', modeAt)
        }
        i = modeAt + 1
        const keepDigits = readDigits()
        if (keepDigits === '' || keepDigits.length > 4) {
          return fail('Add how many dice to keep, like kh3.', i)
        }
        keep = { mode: modeChar === 'h' ? 'high' : 'low', count: Number(keepDigits) }
      }

      term = { kind: 'dice', sign, count, sides, ...(keep ? { keep } : {}) }
    } else if (countDigits !== '') {
      if (countDigits.length > 6) return fail(`Numbers go up to ${diceLimits.maxConstant}.`, start)
      term = { kind: 'constant', sign, value: Number(countDigits) }
    } else {
      const found = text[i]
      return fail(
        found === undefined
          ? 'Add dice or a number.'
          : `Expected dice or a number, found "${found}".`,
        i,
      )
    }

    const problem = termError(term)
    if (problem) return fail(problem, start)
    if (term.kind === 'dice') {
      diceTotal += term.count
      if (diceTotal > diceLimits.maxDiceTotal) {
        return fail(`Up to ${diceLimits.maxDiceTotal} dice in one roll.`, start)
      }
    }
    terms.push(term)
    if (terms.length > diceLimits.maxTerms) {
      return fail(`Up to ${diceLimits.maxTerms} parts in one roll.`, start)
    }

    skipSpace()
    if (i >= text.length) break
    const operator = text[i]
    if (operator !== '+' && operator !== '-') {
      return fail(`Expected "+" or "-", found "${operator}".`, i)
    }
    sign = operator === '-' ? -1 : 1
    i += 1
    skipSpace()
    if (i >= text.length) return fail(`Add dice or a number after "${operator}".`, i)
  }

  return { ok: true, spec: { terms } }
}

export type ChangeResult = { ok: true; spec: RollSpec } | { ok: false; reason: string }

/**
 * Advantage and disadvantage rewrite the one `1d20` term into `2d20kh1` or `2d20kl1`. A spec
 * without exactly one plain, positive `1d20` can't take the mode, and `normal` leaves it alone.
 */
export function applyMode(spec: RollSpec, mode: RollMode): ChangeResult {
  if (mode === 'normal') return { ok: true, spec }
  const isPlainD20 = (term: DiceTerm) =>
    term.kind === 'dice' && term.sign === 1 && term.count === 1 && term.sides === 20 && !term.keep
  const matches = spec.terms.filter(isPlainD20)
  if (matches.length !== 1) {
    return {
      ok: false,
      reason: 'Advantage and disadvantage only apply to a roll with a single d20.',
    }
  }
  const terms = spec.terms.map((term): DiceTerm => {
    if (!isPlainD20(term) || term.kind !== 'dice') return term
    return {
      kind: 'dice',
      sign: 1,
      count: 2,
      sides: 20,
      keep: { mode: mode === 'advantage' ? 'high' : 'low', count: 1 },
    }
  })
  const rewritten = { terms }
  const problem = specError(rewritten)
  return problem ? { ok: false, reason: problem } : { ok: true, spec: rewritten }
}

/**
 * Critical damage (D9): doubles the dice of every dice term, and the dice it keeps, and leaves
 * constants alone. Fails when the doubled roll would go over the limits.
 */
export function doubleDice(spec: RollSpec): ChangeResult {
  const terms = spec.terms.map((term): DiceTerm => {
    if (term.kind !== 'dice') return term
    return {
      ...term,
      count: term.count * 2,
      ...(term.keep ? { keep: { mode: term.keep.mode, count: term.keep.count * 2 } } : {}),
    }
  })
  const doubled = { terms }
  const problem = specError(doubled)
  return problem ? { ok: false, reason: problem } : { ok: true, spec: doubled }
}
