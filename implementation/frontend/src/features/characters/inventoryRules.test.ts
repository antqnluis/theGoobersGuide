import { describe, expect, it } from 'vitest'
import { defaultSheetBody } from './characterValidation'
import {
  attunedCount,
  attunementWarning,
  carriedWeight,
  carryingCapacity,
  describeCoins,
  describeTransaction,
  formatPurseValue,
  formatWeight,
  planSpend,
  sortItems,
} from './inventoryRules'
import { item } from './characterTestData'

describe('purse value', () => {
  it('is whole coins, with ten copper to the silver and ten silver to the gold', () => {
    expect(formatPurseValue({ cp: 0, sp: 0, gp: 0 })).toBe('0 gp')
    expect(formatPurseValue({ cp: 0, sp: 5, gp: 2 })).toBe('2 gp and 5 sp')
    expect(formatPurseValue({ cp: 100, sp: 10, gp: 1 })).toBe('3 gp')
    expect(formatPurseValue({ cp: 5, sp: 5, gp: 100 })).toBe('100 gp, 5 sp and 5 cp')
    expect(formatPurseValue({ cp: 3, sp: 0, gp: 0 })).toBe('3 cp')
    expect(formatPurseValue({ cp: 0, sp: 15, gp: 0 })).toBe('1 gp and 5 sp')
  })

  it('never contains a decimal point', () => {
    for (const cp of [0, 1, 7, 99, 123])
      for (const sp of [0, 3, 14])
        for (const gp of [0, 2, 1234]) {
          expect(formatPurseValue({ cp, sp, gp })).not.toMatch(/\.|≈/)
        }
  })

  it('groups large totals', () => {
    expect(formatPurseValue({ cp: 9_999_999, sp: 9_999_999, gp: 9_999_999 })).toBe(
      '11,099,998 gp, 8 sp and 9 cp',
    )
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

describe('planSpend', () => {
  const plan = (purse: [number, number, number], amounts: [number, number, number]) => {
    const [cp, sp, gp] = purse
    const [acp, asp, agp] = amounts
    return planSpend({ cp, sp, gp }, { cp: acp, sp: asp, gp: agp })
  }
  const net = (purse: [number, number, number], amounts: [number, number, number]) => {
    const result = plan(purse, amounts)
    return result && [result.deltas.cp, result.deltas.sp, result.deltas.gp]
  }

  it('pays with the coins asked for when there are enough', () => {
    expect(net([7, 12, 30], [2, 3, 5])).toEqual([-2, -3, -5])
    expect(plan([7, 12, 30], [2, 3, 5])?.broken).toEqual({})
  })

  it('breaks a gold piece for silver when there is no silver', () => {
    // 5 sp from 3 gp: pay 1 gp, take 5 sp back.
    expect(net([0, 0, 3], [0, 5, 0])).toEqual([0, 5, -1])
    expect(plan([0, 0, 3], [0, 5, 0])?.broken).toEqual({ gp: 1 })
  })

  it('breaks a gold piece when silver runs short, using the silver it has first', () => {
    // 4 sp from 1 sp and 5 gp: pay the sp, then 30 cp more means breaking 1 gp for 70 cp.
    expect(net([0, 1, 5], [0, 4, 0])).toEqual([0, 6, -1])
  })

  it('breaks a gold piece for copper, returning change in silver and copper', () => {
    // 3 cp from 1 gp: pay 1 gp, take back 97 cp as 9 sp and 7 cp.
    expect(net([0, 0, 1], [3, 0, 0])).toEqual([7, 9, -1])
  })

  it('breaks a silver piece for copper', () => {
    expect(net([0, 2, 0], [4, 0, 0])).toEqual([6, -1, 0])
    expect(plan([0, 2, 0], [4, 0, 0])?.broken).toEqual({ sp: 1 })
  })

  it('pays gold with smaller coins when there is no gold', () => {
    expect(net([0, 20, 0], [0, 0, 1])).toEqual([0, -10, 0])
    expect(net([100, 0, 0], [0, 0, 1])).toEqual([-100, 0, 0])
    expect(net([5, 12, 0], [0, 0, 1])).toEqual([-5, -10, 0].map((n, at) => (at === 0 ? 0 : n)))
  })

  it('uses the requested coin before smaller ones', () => {
    // 3 sp with 50 cp and 5 sp: pay silver, keep the copper.
    expect(net([50, 5, 0], [0, 3, 0])).toEqual([0, -3, 0])
    // Short by one silver: the copper covers it, no gold is broken.
    expect(net([50, 1, 9], [0, 3, 0])).toEqual([-20, -1, 0])
  })

  it('pays exactly the whole purse', () => {
    expect(net([5, 5, 5], [5, 5, 5])).toEqual([-5, -5, -5])
    // 510 cp in total: 5 gp and 1 sp.
    expect(net([0, 1, 5], [0, 0, 5])).toEqual([0, 0, -5])
    expect(net([0, 1, 5], [10, 0, 5])).toEqual([0, -1, -5])
  })

  it('returns null when the purse cannot cover the total, even with change', () => {
    expect(plan([0, 1, 5], [0, 0, 6])).toBeNull()
    expect(plan([0, 0, 0], [1, 0, 0])).toBeNull()
    expect(plan([9, 0, 0], [0, 1, 0])).toBeNull()
  })

  it('never ends with a negative balance and always keeps the total consistent', () => {
    const values = [0, 1, 3, 9, 10, 11, 25, 100]
    for (const cp of values)
      for (const sp of values)
        for (const gp of [0, 1, 2, 7])
          for (const acp of [0, 1, 4, 13])
            for (const asp of [0, 1, 6, 15])
              for (const agp of [0, 1, 3]) {
                const purse = { cp, sp, gp }
                const amounts = { cp: acp, sp: asp, gp: agp }
                const result = planSpend(purse, amounts)
                const have = cp + sp * 10 + gp * 100
                const cost = acp + asp * 10 + agp * 100
                if (cost > have) {
                  expect(result).toBeNull()
                  continue
                }
                expect(result).not.toBeNull()
                const after = {
                  cp: cp + result!.deltas.cp,
                  sp: sp + result!.deltas.sp,
                  gp: gp + result!.deltas.gp,
                }
                expect(Math.min(after.cp, after.sp, after.gp)).toBeGreaterThanOrEqual(0)
                expect(after.cp + after.sp * 10 + after.gp * 100).toBe(have - cost)
              }
  })
})

describe('describeCoins', () => {
  it('lists the coins above zero, gold first', () => {
    expect(describeCoins({ cp: 0, sp: 0, gp: 0 })).toBe('')
    expect(describeCoins({ cp: 0, sp: 3, gp: 0 })).toBe('3 sp')
    expect(describeCoins({ cp: 0, sp: 3, gp: 5 })).toBe('5 gp and 3 sp')
    expect(describeCoins({ cp: 2, sp: 3, gp: 1500 })).toBe('1,500 gp, 3 sp and 2 cp')
  })
})

describe('describeTransaction', () => {
  const tx = (delta: [number, number, number], after: [number, number, number]) =>
    describeTransaction({
      id: 'x',
      seq: 1,
      character_id: 'c',
      created_at: '2026-11-14T10:00:00+00:00',
      cp_delta: delta[0],
      sp_delta: delta[1],
      gp_delta: delta[2],
      cp_after: after[0],
      sp_after: after[1],
      gp_after: after[2],
    })

  it('describes additions and spends in the coins that moved', () => {
    expect(tx([0, 0, 10], [0, 0, 10])).toEqual({
      title: 'Added 10 gp',
      steps: ['0 → 10 gp (+10)'],
      total: '10 gp',
    })
    expect(tx([-2, -3, 0], [5, 9, 100])).toEqual({
      title: 'Spent 3 sp and 2 cp',
      steps: ['12 → 9 sp (−3)', '7 → 5 cp (−2)'],
      total: '100 gp, 9 sp and 5 cp',
    })
  })

  it('shows change as what it came to, with the coins on both sides in the steps', () => {
    // 5 sp from gold: 1 gp broken, 5 sp back.
    expect(tx([0, 5, -1], [0, 5, 2])).toEqual({
      title: 'Spent 5 sp (made change)',
      steps: ['3 → 2 gp (−1)', '0 → 5 sp (+5)'],
      total: '2 gp and 5 sp',
    })
    // 3 cp from a gold piece: 97 cp come back as 9 sp and 7 cp.
    expect(tx([7, 9, -1], [7, 9, 0]).title).toBe('Spent 3 cp (made change)')
    // 150 cp is a gold piece and 5 silver.
    expect(tx([0, -5, 2], [0, 0, 2]).title).toBe('Added 1 gp and 5 sp (made change)')
  })

  it('names a change that came to nothing', () => {
    expect(tx([0, 10, -1], [0, 10, 0]).title).toBe('Exchanged coins')
  })
})
