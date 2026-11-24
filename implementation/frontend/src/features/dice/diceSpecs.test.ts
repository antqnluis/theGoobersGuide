import { describe, expect, it } from 'vitest'
import { formatSpec } from './diceNotation'
import { d20Spec, dieSpec } from './diceSpecs'

describe('d20Spec', () => {
  it('adds or subtracts the modifier', () => {
    expect(formatSpec(d20Spec(5))).toBe('1d20 + 5')
    expect(formatSpec(d20Spec(-2))).toBe('1d20 - 2')
  })

  it('leaves out a zero modifier', () => {
    expect(formatSpec(d20Spec(0))).toBe('1d20')
  })
})

describe('dieSpec', () => {
  it('rolls one die of any size with a modifier', () => {
    expect(formatSpec(dieSpec(8, 2))).toBe('1d8 + 2')
    expect(formatSpec(dieSpec(10, -1))).toBe('1d10 - 1')
    expect(formatSpec(dieSpec(6, 0))).toBe('1d6')
  })
})
