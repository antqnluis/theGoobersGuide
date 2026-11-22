import { describe, expect, it } from 'vitest'
import { hushBoost, hushPace, kindleBoost } from './hearthBoost'

describe('hearth boost', () => {
  it('rests at 1 before and after', () => {
    expect(kindleBoost(0)).toBe(1)
    expect(kindleBoost(3)).toBeCloseTo(1)
    expect(hushBoost(0)).toBe(1)
    expect(hushBoost(3)).toBeCloseTo(1)
    expect(hushPace(0)).toBe(1)
  })

  it('surges when kindled and dims when hushed, then recovers monotonically', () => {
    expect(kindleBoost(0.25)).toBeGreaterThan(2)
    expect(hushBoost(0.2)).toBeLessThan(0.4)
    expect(hushBoost(0.2)).toBeGreaterThan(0)
    expect(hushBoost(1.5)).toBeGreaterThan(hushBoost(0.5))
    expect(hushBoost(2.4)).toBeGreaterThan(hushBoost(1.5))
  })

  it('holds the traveller still, then lets it go', () => {
    expect(hushPace(0.3)).toBe(0)
    expect(hushPace(0.9)).toBeGreaterThan(0)
    expect(hushPace(2.2)).toBe(1)
  })
})
