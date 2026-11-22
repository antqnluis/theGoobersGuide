import { describe, expect, it } from 'vitest'
import { AuthSkySignal } from './authSkySignal'

describe('auth sky signal', () => {
  it('rests until something happens', () => {
    const signal = new AuthSkySignal()
    expect(signal.glow(5000)).toBe(1)
    expect(signal.pace(5000)).toBe(1)
  })

  it('dims the hearth and stills the traveller after a refusal, then recovers', () => {
    const signal = new AuthSkySignal()
    signal.hush(1000)
    expect(signal.glow(1200)).toBeLessThan(0.4)
    expect(signal.pace(1300)).toBe(0)
    expect(signal.glow(4000)).toBeCloseTo(1)
    expect(signal.pace(4000)).toBe(1)
  })

  it('flares the hearth for an account made, without stopping the traveller', () => {
    const signal = new AuthSkySignal()
    signal.kindle(1000)
    expect(signal.glow(1250)).toBeGreaterThan(2)
    expect(signal.pace(1250)).toBe(1)
  })
})
