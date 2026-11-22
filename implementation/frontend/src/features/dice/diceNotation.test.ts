import { describe, expect, it } from 'vitest'
import { applyMode, doubleDice, formatSpec, parseDice, specError } from './diceNotation'
import type { DiceTerm, RollSpec } from './diceTypes'

function parsed(text: string): RollSpec {
  const result = parseDice(text)
  if (!result.ok) throw new Error(`"${text}" should parse: ${result.error}`)
  return result.spec
}

function failure(text: string) {
  const result = parseDice(text)
  if (result.ok) throw new Error(`"${text}" should not parse`)
  return result
}

const dice = (count: number, sides: number, sign: 1 | -1 = 1): DiceTerm => ({
  kind: 'dice',
  sign,
  count,
  sides,
})

describe('parseDice', () => {
  it('reads dice and constants', () => {
    expect(parsed('2d6 + 3').terms).toEqual([dice(2, 6), { kind: 'constant', sign: 1, value: 3 }])
    expect(parsed('7').terms).toEqual([{ kind: 'constant', sign: 1, value: 7 }])
  })

  it('treats d20 as 1d20 and d% as d100, in any case', () => {
    expect(parsed('d20').terms).toEqual([dice(1, 20)])
    expect(parsed('D%').terms).toEqual([dice(1, 100)])
    expect(parsed('3D8').terms).toEqual([dice(3, 8)])
  })

  it('tolerates spacing and signs', () => {
    expect(parsed('  1d8+3  ').terms).toEqual(parsed('1d8 + 3').terms)
    expect(parsed('-1d4 - 2').terms).toEqual([
      dice(1, 4, -1),
      { kind: 'constant', sign: -1, value: 2 },
    ])
    expect(parsed('+2d6').terms).toEqual([dice(2, 6)])
    expect(parsed('1d6 +\n 1').terms).toHaveLength(2)
  })

  it('reads keep highest and lowest', () => {
    expect(parsed('4d6kh3').terms).toEqual([
      { kind: 'dice', sign: 1, count: 4, sides: 6, keep: { mode: 'high', count: 3 } },
    ])
    expect(parsed('2D20KL1').terms).toEqual([
      { kind: 'dice', sign: 1, count: 2, sides: 20, keep: { mode: 'low', count: 1 } },
    ])
  })

  it('accepts the limits exactly', () => {
    expect(parsed('100d6').terms).toHaveLength(1)
    expect(parsed('d1000').terms).toHaveLength(1)
    expect(parsed('d2').terms).toHaveLength(1)
    expect(parsed('10000').terms).toHaveLength(1)
    expect(parsed(Array(20).fill('1').join('+')).terms).toHaveLength(20)
    expect(parsed('50d6 + 50d8').terms).toHaveLength(2)
  })

  it.each([
    ['', 0],
    ['   ', 0],
    ['d', 1],
    ['2d', 2],
    ['2x6', 1],
    ['2d6 +', 5],
    ['2d6 3', 4],
    ['2d6 * 2', 4],
    ['dF', 1],
    ['4dF', 2],
    ['abc', 0],
  ])('rejects "%s" at %i', (text, at) => {
    expect(failure(text).at).toBe(at)
  })

  it('rejects dice outside the limits and points at the term', () => {
    expect(failure('101d6').at).toBe(0)
    expect(failure('1d6 + 101d6').at).toBe(6)
    expect(failure('d1').at).toBe(0)
    expect(failure('d1001').at).toBe(0)
    expect(failure('0d6').at).toBe(0)
    expect(failure('d20 + 10001').at).toBe(6)
    expect(failure('99999999999').at).toBe(0)
    expect(failure('51d6 + 50d6').at).toBe(7)
    expect(failure(Array(21).fill('1').join('+')).at).toBe(40)
  })

  it('rejects bad keep clauses', () => {
    expect(failure('4d6k3').at).toBe(4)
    expect(failure('4d6kh').at).toBe(5)
    expect(failure('4d6kh5').at).toBe(0)
    expect(failure('4d6kh0').at).toBe(0)
  })

  it('does not throw on odd input', () => {
    for (const text of ['d99999999', '%', '1d%%', 'kh3', '1d6kh99999999', '++1', '1 d6']) {
      expect(parseDice(text).ok).toBe(false)
    }
  })
})

describe('formatSpec', () => {
  it('writes the canonical form', () => {
    expect(formatSpec(parsed('d20+5'))).toBe('1d20 + 5')
    expect(formatSpec(parsed('2D20KH1 + 5'))).toBe('2d20kh1 + 5')
    expect(formatSpec(parsed('-1d4 - 2 + d%'))).toBe('-1d4 - 2 + 1d100')
    expect(formatSpec(parsed('7'))).toBe('7')
  })

  it('round-trips through the parser', () => {
    for (const text of ['1d20 + 5', '4d6kl3 - 1d4 + 2', '100d1000', '-3 + 2d2']) {
      expect(formatSpec(parsed(text))).toBe(text)
    }
  })
})

describe('specError', () => {
  it('matches the parser limits', () => {
    expect(specError({ terms: [] })).not.toBeNull()
    expect(specError({ terms: [dice(1, 1)] })).not.toBeNull()
    expect(specError({ terms: [dice(1.5, 6)] })).not.toBeNull()
    expect(specError({ terms: [dice(60, 6), dice(60, 6)] })).not.toBeNull()
    expect(specError({ terms: [dice(2, 6)] })).toBeNull()
  })
})

describe('applyMode', () => {
  it('leaves a normal roll alone', () => {
    const spec = parsed('1d20 + 5')
    expect(applyMode(spec, 'normal')).toEqual({ ok: true, spec })
    expect(applyMode(parsed('2d6'), 'normal').ok).toBe(true)
  })

  it('rewrites a single d20', () => {
    const advantage = applyMode(parsed('1d20 + 5'), 'advantage')
    const disadvantage = applyMode(parsed('d20 + 5'), 'disadvantage')
    expect(advantage.ok && formatSpec(advantage.spec)).toBe('2d20kh1 + 5')
    expect(disadvantage.ok && formatSpec(disadvantage.spec)).toBe('2d20kl1 + 5')
  })

  it('keeps other dice in the roll', () => {
    const result = applyMode(parsed('1d20 + 1d4 + 2'), 'advantage')
    expect(result.ok && formatSpec(result.spec)).toBe('2d20kh1 + 1d4 + 2')
  })

  it('reports when it cannot apply', () => {
    for (const text of ['2d6', '2d20', '1d20 + 1d20', '2d20kh1', '-1d20', '5']) {
      expect(applyMode(parsed(text), 'advantage').ok).toBe(false)
    }
  })

  it('does not change the original spec', () => {
    const spec = parsed('1d20')
    applyMode(spec, 'advantage')
    expect(formatSpec(spec)).toBe('1d20')
  })
})

describe('doubleDice', () => {
  it('doubles dice and not constants', () => {
    const result = doubleDice(parsed('1d8 + 3'))
    expect(result.ok && formatSpec(result.spec)).toBe('2d8 + 3')
    const mixed = doubleDice(parsed('1d8 + 2d6 + 3'))
    expect(mixed.ok && formatSpec(mixed.spec)).toBe('2d8 + 4d6 + 3')
  })

  it('doubles kept dice with the dice', () => {
    const result = doubleDice(parsed('4d6kh3'))
    expect(result.ok && formatSpec(result.spec)).toBe('8d6kh6')
  })

  it('fails when the doubled roll is too big', () => {
    expect(doubleDice(parsed('51d6')).ok).toBe(false)
    expect(doubleDice(parsed('50d6')).ok).toBe(true)
  })
})
