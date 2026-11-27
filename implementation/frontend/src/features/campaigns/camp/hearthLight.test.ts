import { describe, expect, it } from 'vitest'
import { flickerLevels } from './campLight'
import { hearthGlow, hearthRange, hearthStrength } from './hearthLight'

describe('hearthGlow', () => {
  it('follows the flicker level between the dim and resting light', () => {
    expect(hearthGlow(0)).toBeCloseTo(hearthRange.dim)
    expect(hearthGlow(flickerLevels - 1)).toBeCloseTo(1)
    expect(hearthGlow(2)).toBeGreaterThan(hearthGlow(1))
  })

  it('swells with a flare but never past the brightest light', () => {
    expect(hearthGlow(3, 0.5)).toBeGreaterThan(hearthGlow(3, 0))
    expect(hearthGlow(flickerLevels - 1, 10)).toBe(hearthRange.bright)
  })

  it('holds one steady light when settled, whatever level it is given', () => {
    expect(hearthGlow(0, 0, true)).toBe(hearthGlow(flickerLevels - 1, 0, true))
  })

  it('stays inside the range for levels outside the table', () => {
    expect(hearthGlow(-4)).toBeCloseTo(hearthRange.dim)
    expect(hearthGlow(99)).toBeCloseTo(1)
  })
})

describe('hearthStrength', () => {
  it('lights the overview most and never washes a page past a faint tint', () => {
    const strengths = Object.values(hearthStrength)
    expect(Math.max(...strengths)).toBe(hearthStrength.overview)
    // At its brightest the wash must stay a light tint, so ink keeps its contrast.
    expect(Math.max(...strengths) * hearthRange.bright).toBeLessThan(0.22)
  })
})
