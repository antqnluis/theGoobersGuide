import { describe, expect, it } from 'vitest'
import { defaultSheetBody } from './characterValidation'
import {
  attunedCount,
  attunementWarning,
  carriedWeight,
  carryingCapacity,
  coinValueInGold,
  formatGold,
  formatWeight,
  sortItems,
} from './inventoryRules'
import { item } from './characterTestData'

describe('coin value', () => {
  it('converts copper and silver to gold at the standard rates', () => {
    expect(coinValueInGold({ cp: 0, sp: 0, gp: 0 })).toBe(0)
    expect(coinValueInGold({ cp: 100, sp: 10, gp: 1 })).toBe(3)
    expect(coinValueInGold({ cp: 5, sp: 5, gp: 100 })).toBe(100.55)
  })

  it('avoids floating-point noise', () => {
    expect(coinValueInGold({ cp: 1, sp: 2, gp: 0 })).toBe(0.21)
    expect(coinValueInGold({ cp: 3, sp: 0, gp: 0 })).toBe(0.03)
  })

  it('formats gold with grouping and at most two decimals', () => {
    expect(formatGold(0)).toBe('≈ 0 gp')
    expect(formatGold(123.45)).toBe('≈ 123.45 gp')
    expect(formatGold(99_999_990)).toBe('≈ 99,999,990 gp')
  })
})

describe('carried weight', () => {
  it('sums weight × quantity and ignores items without a weight', () => {
    expect(carriedWeight([])).toBe(0)
    expect(
      carriedWeight([
        { weight: 2.5, quantity: 4 },
        { weight: null, quantity: 100 },
        { weight: 0.1, quantity: 3 },
      ]),
    ).toBe(10.3)
  })

  it('counts a used-up item as zero', () => {
    expect(carriedWeight([{ weight: 5, quantity: 0 }])).toBe(0)
  })

  it('formats weights', () => {
    expect(formatWeight(0)).toBe('0 lb')
    expect(formatWeight(10.3)).toBe('10.3 lb')
    expect(formatWeight(1234.5)).toBe('1,234.5 lb')
  })
})

describe('carrying capacity', () => {
  it('is Strength × 15', () => {
    const body = defaultSheetBody()
    expect(carryingCapacity(body)).toBe(150)
    expect(carryingCapacity({ abilities: { ...body.abilities, str: 21 } })).toBe(315)
  })
})

describe('attunement', () => {
  const attuned = (count: number) =>
    Array.from({ length: count }, () => ({ attuned: true })).concat([{ attuned: false }])

  it('counts attuned items', () => {
    expect(attunedCount(attuned(2))).toBe(2)
    expect(attunedCount([])).toBe(0)
  })

  it('warns above three and never at or below', () => {
    expect(attunementWarning(attuned(3))).toBeNull()
    expect(attunementWarning(attuned(4))).toBe('More than 3 attuned items')
  })
})

describe('sortItems', () => {
  it('puts equipped items first, then sorts by name ignoring case, without mutating', () => {
    const items = [
      item({ id: '1', name: 'rope' }),
      item({ id: '2', name: 'Torch' }),
      item({ id: '3', name: 'Sword', equipped: true }),
      item({ id: '4', name: 'Armor', equipped: true }),
      item({ id: '5', name: 'Arrows' }),
    ]
    const sorted = sortItems(items)
    expect(sorted.map((row) => row.name)).toEqual(['Armor', 'Sword', 'Arrows', 'rope', 'Torch'])
    expect(items.map((row) => row.id)).toEqual(['1', '2', '3', '4', '5'])
  })

  it('keeps duplicates in creation order', () => {
    const sorted = sortItems([
      item({ id: 'b', name: 'Torch', created_at: '2026-11-14T10:02:00+00:00' }),
      item({ id: 'a', name: 'Torch', created_at: '2026-11-14T10:01:00+00:00' }),
    ])
    expect(sorted.map((row) => row.id)).toEqual(['a', 'b'])
  })
})
