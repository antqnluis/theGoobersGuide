import { describe, expect, it } from 'vitest'
import { parseDice } from './diceNotation'
import { rollSpec } from './diceRandom'
import {
  announcement,
  faceMark,
  flattenLog,
  groupByMinute,
  isConstantOnly,
  isLocalRoll,
  localRollRecord,
  mergeRollIntoLog,
  naturalOutcome,
  rollTitle,
  toRollRecord,
  type DiceLogPages,
  type DiceRollRecord,
} from './diceRules'
import type { DiceTerm, RolledFace } from './diceTypes'

const d20: DiceTerm = { kind: 'dice', sign: 1, count: 1, sides: 20 }
const kept = (value: number): RolledFace => ({ value, kept: true })
const dropped = (value: number): RolledFace => ({ value, kept: false })

function record(overrides: Partial<DiceRollRecord> = {}): DiceRollRecord {
  return {
    id: 'r1',
    campaign_id: 'c1',
    roller_id: 'p1',
    character_id: null,
    visibility: 'campaign',
    source: 'tray',
    label: null,
    expression: '1d20',
    terms: [d20],
    dice: [[kept(12)]],
    total: 12,
    created_at: '2026-11-22T14:30:10.000Z',
    ...overrides,
  }
}

describe('toRollRecord', () => {
  it('keeps the row and types its json columns', () => {
    const row = {
      ...record(),
      terms: [d20] as never,
      dice: [[{ value: 3, kept: true }]] as never,
    }
    expect(toRollRecord(row)).toEqual({ ...row })
  })
})

describe('localRollRecord', () => {
  it('is private, unsaved, and marked local', () => {
    const spec = parseDice('1d20 + 5')
    if (!spec.ok) throw new Error('parse')
    const local = localRollRecord(rollSpec(spec.spec), { label: 'Stealth check', source: 'skill' })
    expect(isLocalRoll(local)).toBe(true)
    expect(local.visibility).toBe('self')
    expect(local.campaign_id).toBe('')
    expect(local.label).toBe('Stealth check')
    expect(local.expression).toBe('1d20 + 5')
    expect(isLocalRoll(record())).toBe(false)
  })
})

describe('rollTitle', () => {
  it('prefers the label and falls back to the expression', () => {
    expect(rollTitle(record({ label: 'Stealth check' }))).toBe('Stealth check')
    expect(rollTitle(record())).toBe('1d20')
  })
})

describe('isConstantOnly', () => {
  it('flags a roll with no dice', () => {
    expect(isConstantOnly({ terms: [{ kind: 'constant', sign: 1, value: 4 }] })).toBe(true)
    expect(isConstantOnly({ terms: [d20] })).toBe(false)
  })
})

describe('faceMark', () => {
  it('marks only a d20 showing 20 or 1', () => {
    expect(faceMark(20, 20)).toBe('max')
    expect(faceMark(20, 1)).toBe('min')
    expect(faceMark(20, 7)).toBeNull()
    expect(faceMark(6, 6)).toBeNull()
    expect(faceMark(6, 1)).toBeNull()
  })
})

describe('naturalOutcome', () => {
  it('reads the kept d20', () => {
    expect(naturalOutcome({ terms: [d20], dice: [[kept(20)]] })).toBe('natural-20')
    expect(naturalOutcome({ terms: [d20], dice: [[kept(1)]] })).toBe('natural-1')
    expect(naturalOutcome({ terms: [d20], dice: [[kept(14)]] })).toBeNull()
  })

  it('ignores the dropped die of advantage', () => {
    const advantage: DiceTerm = { ...d20, count: 2, keep: { mode: 'high', count: 1 } }
    expect(naturalOutcome({ terms: [advantage], dice: [[dropped(20), kept(20)]] })).toBe(
      'natural-20',
    )
    expect(naturalOutcome({ terms: [advantage], dice: [[kept(9), dropped(1)]] })).toBeNull()
    expect(naturalOutcome({ terms: [advantage], dice: [[dropped(1), kept(9)]] })).toBeNull()
  })

  it('needs a positive d20 term', () => {
    expect(naturalOutcome({ terms: [{ ...d20, sign: -1 }], dice: [[kept(20)]] })).toBeNull()
    expect(
      naturalOutcome({ terms: [{ kind: 'dice', sign: 1, count: 1, sides: 6 }], dice: [[kept(6)]] }),
    ).toBeNull()
    expect(
      naturalOutcome({ terms: [{ kind: 'constant', sign: 1, value: 20 }], dice: [[]] }),
    ).toBeNull()
  })

  it('does not call a pair of d20 kept faces natural', () => {
    expect(
      naturalOutcome({ terms: [{ ...d20, count: 2 }], dice: [[kept(20), kept(3)]] }),
    ).toBeNull()
  })
})

describe('announcement', () => {
  it('says who rolled what, and notes a natural', () => {
    expect(announcement('Mira', record({ label: 'Stealth', total: 17 }))).toBe(
      'Mira rolled Stealth: 17.',
    )
    expect(announcement('You', record({ dice: [[kept(20)]], total: 20 }))).toBe(
      'You rolled 1d20: 20. Natural 20.',
    )
  })
})

describe('the log pages', () => {
  const page = (...rolls: DiceRollRecord[]): DiceLogPages => ({
    pages: [rolls],
    pageParams: [null],
  })

  it('adds a new roll to the front of the first page', () => {
    const older = record({ id: 'a', created_at: '2026-11-22T14:00:00.000Z' })
    const newer = record({ id: 'b', created_at: '2026-11-22T14:05:00.000Z' })
    const merged = mergeRollIntoLog(page(older), newer)
    expect(merged?.pages[0].map((roll) => roll.id)).toEqual(['b', 'a'])
  })

  it('does not add a roll the log already has (own result and Realtime both arrive)', () => {
    const data = page(record({ id: 'a' }))
    expect(mergeRollIntoLog(data, record({ id: 'a' }))).toBe(data)
    const twoPages: DiceLogPages = {
      pages: [[record({ id: 'a' })], [record({ id: 'b' })]],
      pageParams: [null, 'x'],
    }
    expect(mergeRollIntoLog(twoPages, record({ id: 'b' }))).toBe(twoPages)
  })

  it('leaves an unloaded log alone', () => {
    expect(mergeRollIntoLog(undefined, record())).toBeUndefined()
  })

  it('flattens pages newest first without repeats', () => {
    const data: DiceLogPages = {
      pages: [
        [
          record({ id: 'c', created_at: '2026-11-22T14:10:00.000Z' }),
          record({ id: 'b', created_at: '2026-11-22T14:05:00.000Z' }),
        ],
        [
          record({ id: 'b', created_at: '2026-11-22T14:05:00.000Z' }),
          record({ id: 'a', created_at: '2026-11-22T14:00:00.000Z' }),
        ],
      ],
      pageParams: [null, 'x'],
    }
    expect(flattenLog(data).map((roll) => roll.id)).toEqual(['c', 'b', 'a'])
    expect(flattenLog(undefined)).toEqual([])
  })

  it('orders rolls with the same timestamp by id, newest id first', () => {
    const same = '2026-11-22T14:00:00.000Z'
    const data = page(record({ id: 'a', created_at: same }), record({ id: 'b', created_at: same }))
    expect(flattenLog(data).map((roll) => roll.id)).toEqual(['b', 'a'])
  })
})

describe('groupByMinute', () => {
  it('groups neighbouring rolls made in the same minute', () => {
    const at = (second: number, minute: number) =>
      new Date(2026, 10, 22, 14, minute, second).toISOString()
    const groups = groupByMinute([
      record({ id: 'a', created_at: at(50, 31) }),
      record({ id: 'b', created_at: at(5, 31) }),
      record({ id: 'c', created_at: at(55, 30) }),
    ])
    expect(groups.map((group) => group.rolls.map((roll) => roll.id))).toEqual([['a', 'b'], ['c']])
  })

  it('returns nothing for an empty log', () => {
    expect(groupByMinute([])).toEqual([])
  })
})
