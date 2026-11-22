import { describe, expect, it } from 'vitest'
import { formatSpec } from './diceNotation'
import { attackRollSpec, damageSpec, findDice, splitDice } from './diceText'

const found = (text: string) => findDice(text).map((match) => match.text)

describe('findDice', () => {
  it('finds dice in spell and feature text', () => {
    expect(found('A bright streak deals 8d6 fire damage (DC 15 Dex save).')).toEqual(['8d6'])
    expect(found('Roll a d20 and add your proficiency bonus.')).toEqual(['d20'])
    expect(found('Heals 2d4 + 2 hit points.')).toEqual(['2d4 + 2'])
    expect(found('1d8+3 slashing plus 2d6 fire')).toEqual(['1d8+3', '2d6'])
    expect(found('Roll 4d6kh3 for each ability, or D% for a wild surge.')).toEqual(['4d6kh3', 'D%'])
    expect(found('1d6 + 1d4 + 2 radiant')).toEqual(['1d6 + 1d4 + 2'])
  })

  it('reports ranges and specs', () => {
    const [match] = findDice('Deals 2d6 + 3 fire.')
    expect(match.start).toBe(6)
    expect(match.end).toBe(13)
    expect('Deals 2d6 + 3 fire.'.slice(match.start, match.end)).toBe('2d6 + 3')
    expect(formatSpec(match.spec)).toBe('2d6 + 3')
  })

  it('never matches a bare number or modifier', () => {
    for (const text of ['+5 to hit', 'AC 15', 'a +2 longsword', '5', '1 + 2', 'Str +3, Dex -1']) {
      expect(found(text)).toEqual([])
    }
  })

  it('does not match prose that looks a little like dice', () => {
    for (const text of [
      'a 3d printer',
      'the d-day landing',
      'Dd',
      '3D',
      'D&D 5e',
      'add20',
      'abc2d6',
      '1.5d6',
      'word4d6kh',
      '2d6s',
      'd20x',
      'He said 2d.',
    ]) {
      expect(found(text)).toEqual([])
    }
  })

  it('stops a modifier at a word', () => {
    expect(found('1d8 + 3rd-level spell')).toEqual(['1d8'])
    expect(found('2d6 + 5-foot radius')).toEqual(['2d6'])
    expect(found('1d8 + 3 slashing')).toEqual(['1d8 + 3'])
    expect(found('1d8 + STR modifier')).toEqual(['1d8'])
  })

  it('handles punctuation and line breaks around dice', () => {
    expect(found('(2d6)')).toEqual(['2d6'])
    expect(found('2d6, 1d4; d8.')).toEqual(['2d6', '1d4', 'd8'])
    expect(found('1d6\n+ 2')).toEqual(['1d6'])
    expect(found('1d6 +\n2')).toEqual(['1d6'])
  })

  it('skips dice over the limits', () => {
    expect(found('d1 and d1001 and 101d6')).toEqual([])
    expect(found('d1001 then 2d6')).toEqual(['2d6'])
    expect(found('99999d6')).toEqual([])
  })

  it('returns nothing for empty text', () => {
    expect(findDice('')).toEqual([])
  })
})

describe('splitDice', () => {
  it('splits text so the pieces join back to the input', () => {
    const text = 'Deals 2d6 fire, then 1d4+1 cold. Done'
    const segments = splitDice(text)
    expect(segments.map((segment) => segment.text).join('')).toBe(text)
    expect(segments.map((segment) => segment.kind)).toEqual([
      'text',
      'dice',
      'text',
      'dice',
      'text',
    ])
  })

  it('returns one text segment when there are no dice', () => {
    expect(splitDice('no dice here')).toEqual([{ kind: 'text', text: 'no dice here' }])
    expect(splitDice('')).toEqual([])
  })

  it('starts and ends on dice without empty text pieces', () => {
    expect(splitDice('d20').map((segment) => segment.kind)).toEqual(['dice'])
  })
})

describe('attackRollSpec', () => {
  it('reads a bonus into a d20 roll', () => {
    expect(formatSpec(attackRollSpec('+5')!)).toBe('1d20 + 5')
    expect(formatSpec(attackRollSpec('5')!)).toBe('1d20 + 5')
    expect(formatSpec(attackRollSpec('-1')!)).toBe('1d20 - 1')
    expect(formatSpec(attackRollSpec(' + 7 ')!)).toBe('1d20 + 7')
  })

  it('leaves out a zero bonus', () => {
    expect(formatSpec(attackRollSpec('+0')!)).toBe('1d20')
  })

  it('gives null for anything else', () => {
    for (const bonus of ['', '  ', '+5 to hit (finesse)', 'abc', '1d20+5', '+', '5.5', '+99999']) {
      expect(attackRollSpec(bonus)).toBeNull()
    }
  })
})

describe('damageSpec', () => {
  it('reads one dice segment with its label', () => {
    const result = damageSpec('1d8+3 slashing')!
    expect(formatSpec(result.spec)).toBe('1d8 + 3')
    expect(result.segments).toEqual([{ label: 'slashing', start: 0, end: 2 }])
  })

  it('combines every dice segment into one spec', () => {
    const result = damageSpec('1d8+3 slashing plus 2d6 fire')!
    expect(formatSpec(result.spec)).toBe('1d8 + 3 + 2d6')
    expect(result.segments).toEqual([
      { label: 'slashing', start: 0, end: 2 },
      { label: 'fire', start: 2, end: 3 },
    ])
  })

  it('handles separators and modifiers in the label', () => {
    expect(damageSpec('2d6 fire, 1d4 cold')!.segments.map((s) => s.label)).toEqual(['fire', 'cold'])
    expect(damageSpec('1d8 + STR slashing')!.segments[0].label).toBe('STR slashing')
    expect(damageSpec('1d10')!.segments[0].label).toBeNull()
  })

  it('gives null without dice or over the limits', () => {
    expect(damageSpec('')).toBeNull()
    expect(damageSpec('5 bludgeoning')).toBeNull()
    expect(damageSpec('see notes')).toBeNull()
    expect(damageSpec(Array(21).fill('1d4').join(' '))).toBeNull()
  })

  it('keeps long labels short', () => {
    const label = damageSpec(`1d4 ${'x'.repeat(100)}`)!.segments[0].label
    expect(label).toHaveLength(40)
  })
})
