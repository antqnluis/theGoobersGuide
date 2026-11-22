import { describe, expect, it } from 'vitest'
import { formatSpec } from './diceNotation'
import { d20Spec } from './diceSpecs'

describe('d20Spec', () => {
  it('adds or subtracts the modifier', () => {
    expect(formatSpec(d20Spec(5))).toBe('1d20 + 5')
    expect(formatSpec(d20Spec(-2))).toBe('1d20 - 2')
  })

  it('leaves out a zero modifier', () => {
    expect(formatSpec(d20Spec(0))).toBe('1d20')
  })
})
