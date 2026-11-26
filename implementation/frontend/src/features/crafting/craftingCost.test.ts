import { describe, expect, it } from 'vitest'
import {
  describeGuideline,
  formatCopper,
  guidelineFor,
  lineCost,
  materialsSubtotal,
  missingCount,
  stillToPay,
  totalCost,
  type CostLine,
} from './craftingCost'

// The plan's §2.6 table: a character holding 1 Wyvern Fang and 1 Wyvern Poison Gland.
const gland = (need: number, have: number): CostLine => ({ value_cp: 5000, need, have })
const fang = (need: number, have: number): CostLine => ({ value_cp: 4000, need, have })
const base = (need: number, have: number): CostLine => ({ value_cp: 500, need, have })

const venomOil = { lines: [gland(1, 1), base(2, 0)], crafting: 4000 }
const fangDagger = { lines: [fang(2, 1), gland(1, 1)], crafting: 7000 }

describe('the §2.6 visions', () => {
  it('Venom Blade Oil: 100 gp in all, 50 gp still to pay', () => {
    expect(materialsSubtotal(venomOil.lines)).toBe(6000)
    expect(totalCost(venomOil.lines, venomOil.crafting)).toBe(10_000)
    expect(stillToPay(venomOil.lines, venomOil.crafting)).toBe(5000)
    expect(formatCopper(10_000)).toBe('100 gp')
    expect(formatCopper(5000)).toBe('50 gp')
  })

  it('Wyvern Fang Dagger: 200 gp in all, and a partial key counts only what is missing', () => {
    expect(materialsSubtotal(fangDagger.lines)).toBe(13_000)
    expect(totalCost(fangDagger.lines, fangDagger.crafting)).toBe(20_000)
    // One more fang (40 gp) and the 70 gp crafting cost.
    expect(stillToPay(fangDagger.lines, fangDagger.crafting)).toBe(11_000)
    expect(formatCopper(11_000)).toBe('110 gp')
  })
})

describe('line arithmetic', () => {
  it('prices a line by quantity needed, not held', () => {
    expect(lineCost(fang(4, 0))).toBe(16_000)
    expect(lineCost(fang(4, 9))).toBe(16_000)
  })

  it('never counts a surplus as negative', () => {
    expect(missingCount(fang(2, 5))).toBe(0)
    expect(stillToPay([fang(2, 5)], 0)).toBe(0)
    expect(missingCount(fang(2, 0))).toBe(2)
  })

  it('is the crafting cost alone when everything is held', () => {
    expect(stillToPay([gland(1, 1), fang(2, 2)], 7000)).toBe(7000)
  })

  it('has no materials, only a crafting cost', () => {
    expect(totalCost([], 2500)).toBe(2500)
    expect(stillToPay([], 2500)).toBe(2500)
  })

  it('stays exact at the largest values', () => {
    const lines: CostLine[] = Array.from({ length: 20 }, () => ({
      value_cp: 100_000_000,
      need: 999,
      have: 0,
    }))
    expect(totalCost(lines, 100_000_000)).toBe(20 * 100_000_000 * 999 + 100_000_000)
    expect(Number.isSafeInteger(totalCost(lines, 100_000_000))).toBe(true)
  })
})

describe('formatCopper', () => {
  it.each([
    [0, '0 gp'],
    [1, '1 cp'],
    [10, '1 sp'],
    [105, '1 gp and 5 cp'],
    [1234, '12 gp, 3 sp and 4 cp'],
    [123_456_789, '1,234,567 gp, 8 sp and 9 cp'],
  ])('%s cp reads %s', (copper, text) => {
    expect(formatCopper(copper)).toBe(text)
  })
})

describe('the DMG guideline', () => {
  it.each([
    ['common', 5000, 5],
    ['uncommon', 20_000, 10],
    ['rare', 200_000, 50],
    ['very_rare', 2_000_000, 125],
    ['legendary', 10_000_000, 250],
  ] as const)('%s items', (rarity, costCp, workdays) => {
    expect(guidelineFor(rarity, false)).toEqual({ costCp, workdays })
  })

  it('halves the cost and time of a consumable, rounding days up', () => {
    expect(guidelineFor('uncommon', true)).toEqual({ costCp: 10_000, workdays: 5 })
    expect(guidelineFor('common', true)).toEqual({ costCp: 2500, workdays: 3 })
  })

  it('has none for artifacts', () => {
    expect(guidelineFor('artifact', false)).toBeNull()
    expect(describeGuideline('artifact', false, 'Artifact')).toBeNull()
  })

  it('reads as a sentence', () => {
    expect(describeGuideline('uncommon', false, 'Uncommon')).toBe(
      'Guideline for an item of uncommon rarity: 200 gp, 10 workdays.',
    )
    expect(describeGuideline('uncommon', true, 'Uncommon')).toBe(
      'Guideline for a consumable of uncommon rarity: 100 gp, 5 workdays.',
    )
  })
})
