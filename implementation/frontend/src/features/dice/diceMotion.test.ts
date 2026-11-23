import { describe, expect, it } from 'vitest'
import { flightKeyframes, flightMs, lockAt, randomFace, spinSchedule } from './diceMotion'

describe('randomFace', () => {
  it('stays within the die and never repeats the face just shown', () => {
    for (let i = 0; i < 500; i += 1) {
      const previous = 1 + (i % 6)
      const next = randomFace(6, previous)
      expect(next).toBeGreaterThanOrEqual(1)
      expect(next).toBeLessThanOrEqual(6)
      expect(next).not.toBe(previous)
    }
  })

  it('still moves on a two-sided die', () => {
    expect(randomFace(2, 1, () => 0)).toBe(2)
    expect(randomFace(2, 2, () => 0.99)).toBe(1)
  })
})

describe('spinSchedule', () => {
  it('starts at the toss, ends before the lock, and slows down', () => {
    const lock = flightMs * lockAt
    const times = spinSchedule(lock)
    expect(times[0]).toBe(0)
    expect(times.at(-1)!).toBeLessThan(lock)
    const gaps = times.slice(1).map((time, index) => time - times[index])
    expect(gaps.every((gap, index) => index === 0 || gap >= gaps[index - 1])).toBe(true)
    expect(gaps.at(-1)!).toBeGreaterThan(gaps[0] * 2)
  })
})

describe('flightKeyframes', () => {
  it('samples the whole flight and ends exactly at rest', () => {
    const frames = flightKeyframes(() => 0.25)
    expect(frames[0].offset).toBe(0)
    expect(frames.at(-1)!.offset).toBe(1)
    expect(frames[0].opacity).toBe(0)
    const last = String(frames.at(-1)!.transform)
    expect(last).toContain('translate(0.00px, 0.00px)')
    expect(last).toContain('rotateZ(0.0deg)')
    expect(last).toContain('scale(1.000, 1.000)')
  })

  it('keeps every frame the same transform shape so the browser can blend them', () => {
    const shape = (transform: unknown) => String(transform).replace(/-?\d+(\.\d+)?/g, '#')
    const frames = flightKeyframes()
    const first = shape(frames[0].transform)
    expect(frames.every((frame) => shape(frame.transform) === first)).toBe(true)
  })
})
