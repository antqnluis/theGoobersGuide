import { describe, expect, it } from 'vitest'
import { parseDice } from './diceNotation'
import { keptTotal, markKept, randomInt, rollSpec, type RandomSource } from './diceRandom'
import type { RollSpec } from './diceTypes'

/** A small seeded generator (mulberry32) returning uint32, so these tests are deterministic. */
function seeded(seed: number): RandomSource {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) >>> 0
  }
}

function sequence(...draws: number[]): RandomSource {
  let index = 0
  return () => {
    if (index >= draws.length) throw new Error('Ran out of draws')
    return draws[index++]
  }
}

function spec(text: string): RollSpec {
  const result = parseDice(text)
  if (!result.ok) throw new Error(result.error)
  return result.spec
}

describe('randomInt', () => {
  it('maps draws to 1..sides', () => {
    expect(randomInt(6, sequence(0))).toBe(1)
    expect(randomInt(6, sequence(5))).toBe(6)
    expect(randomInt(6, sequence(6))).toBe(1)
    expect(randomInt(1, sequence(123))).toBe(1)
  })

  it('rejects draws from the biased tail and draws again', () => {
    // For 3 sides, 4294967295 is the one value past the largest multiple of 3 and is redrawn.
    expect(randomInt(3, sequence(4294967295, 4))).toBe(2)
    // For 6 sides, the tail is 4294967292..4294967295.
    expect(randomInt(6, sequence(4294967295, 4294967292, 4294967291))).toBe((4294967291 % 6) + 1)
  })

  it('never redraws for a power of two', () => {
    expect(randomInt(2, sequence(4294967295))).toBe(2)
  })

  it('rejects impossible dice', () => {
    expect(() => randomInt(0)).toThrow(RangeError)
    expect(() => randomInt(2.5)).toThrow(RangeError)
  })

  it('stays in bounds with the real source', () => {
    for (const sides of [2, 6, 20, 100, 1000]) {
      for (let i = 0; i < 200; i += 1) {
        const value = randomInt(sides)
        expect(value).toBeGreaterThanOrEqual(1)
        expect(value).toBeLessThanOrEqual(sides)
      }
    }
  })

  it('is uniform over many rolls', () => {
    const source = seeded(20261122)
    const sides = 6
    const rolls = 60000
    const counts = new Array<number>(sides).fill(0)
    for (let i = 0; i < rolls; i += 1) counts[randomInt(sides, source) - 1] += 1
    const expected = rolls / sides
    const chiSquare = counts.reduce((sum, seen) => sum + (seen - expected) ** 2 / expected, 0)
    // 5 degrees of freedom; 20.5 is the p = 0.001 critical value. The seed is fixed, so this is stable.
    expect(chiSquare).toBeLessThan(20.5)
  })

  it('is uniform for a die that needs rejection', () => {
    const source = seeded(7)
    const sides = 1000
    const counts = new Array<number>(sides).fill(0)
    const rolls = 200000
    for (let i = 0; i < rolls; i += 1) counts[randomInt(sides, source) - 1] += 1
    const expected = rolls / sides
    const chiSquare = counts.reduce((sum, seen) => sum + (seen - expected) ** 2 / expected, 0)
    // 999 degrees of freedom; 1,143 is above the p = 0.001 critical value (about 1,143).
    expect(chiSquare).toBeLessThan(1150)
  })
})

describe('markKept', () => {
  it('keeps everything without a keep clause', () => {
    expect(markKept([3, 5], undefined)).toEqual([
      { value: 3, kept: true },
      { value: 5, kept: true },
    ])
  })

  it('keeps the highest and lowest faces', () => {
    const high = markKept([2, 6, 4, 1], { mode: 'high', count: 3 })
    expect(high.map((face) => face.kept)).toEqual([true, true, true, false])
    const low = markKept([2, 6, 4, 1], { mode: 'low', count: 2 })
    expect(low.map((face) => face.kept)).toEqual([true, false, false, true])
  })

  it('keeps the earliest die on a tie', () => {
    const faces = markKept([4, 4, 4], { mode: 'high', count: 1 })
    expect(faces.map((face) => face.kept)).toEqual([true, false, false])
  })

  it('totals only kept faces', () => {
    expect(keptTotal(markKept([2, 6, 4, 1], { mode: 'high', count: 3 }))).toBe(12)
  })
})

describe('rollSpec', () => {
  it('sums dice and constants', () => {
    // Draws 0, 1, 2 become 1, 2, 3 on a d6.
    const result = rollSpec(spec('3d6 + 4'), sequence(0, 1, 2))
    expect(result.total).toBe(10)
    expect(result.expression).toBe('3d6 + 4')
    expect(result.dice.map((faces) => faces.map((face) => face.value))).toEqual([[1, 2, 3], []])
  })

  it('subtracts negative terms', () => {
    const result = rollSpec(spec('1d6 - 1d4 - 1'), sequence(5, 1))
    expect(result.total).toBe(6 - 2 - 1)
  })

  it('drops dice for advantage and disadvantage', () => {
    // Draws 4 and 14 become 5 and 15 on a d20.
    const advantage = rollSpec(spec('2d20kh1 + 2'), sequence(4, 14))
    expect(advantage.total).toBe(17)
    expect(advantage.dice[0].map((face) => face.kept)).toEqual([false, true])
    const disadvantage = rollSpec(spec('2d20kl1 + 2'), sequence(4, 14))
    expect(disadvantage.total).toBe(7)
    expect(disadvantage.dice[0].map((face) => face.kept)).toEqual([true, false])
  })

  it('allows a roll of only constants', () => {
    const result = rollSpec(spec('5'), sequence())
    expect(result.total).toBe(5)
    expect(result.dice).toEqual([[]])
  })

  it('refuses a spec over the limits', () => {
    expect(() => rollSpec({ terms: [{ kind: 'dice', sign: 1, count: 101, sides: 6 }] })).toThrow(
      RangeError,
    )
    expect(() => rollSpec({ terms: [] })).toThrow(RangeError)
  })

  it('keeps every face and total within bounds', () => {
    const source = seeded(99)
    for (let i = 0; i < 300; i += 1) {
      const result = rollSpec(spec('4d6kh3 + 2d8 - 1d4 + 3'), source)
      for (const [index, faces] of result.dice.entries()) {
        const term = result.spec.terms[index]
        if (term.kind !== 'dice') continue
        expect(faces).toHaveLength(term.count)
        for (const face of faces) {
          expect(face.value).toBeGreaterThanOrEqual(1)
          expect(face.value).toBeLessThanOrEqual(term.sides)
        }
      }
      expect(result.total).toBeGreaterThanOrEqual(3 + 2 + 3 - 4 + 3 - 0)
      expect(result.total).toBeLessThanOrEqual(18 + 16 - 1 + 3)
    }
  })
})
