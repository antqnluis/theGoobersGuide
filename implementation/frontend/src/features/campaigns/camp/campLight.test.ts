import { describe, expect, it } from 'vitest'
import {
  ambientColour,
  bayer,
  buildPool,
  duskDuration,
  fireIntensity,
  flickerLevel,
  flickerLevels,
  flickerShape,
  lightRadius,
  shadowFor,
} from './campLight'

describe('fireIntensity', () => {
  it('is strongest at the centre and gone at and beyond the edge of the pool', () => {
    expect(fireIntensity(0, 0)).toBe(1)
    expect(fireIntensity(lightRadius.x, 0)).toBe(0)
    expect(fireIntensity(0, lightRadius.y + 5)).toBe(0)
    expect(fireIntensity(40, 0)).toBeGreaterThan(fireIntensity(80, 0))
  })

  it('is wider than it is tall, and scales with the flicker', () => {
    expect(fireIntensity(40, 0)).toBeGreaterThan(fireIntensity(0, 40))
    expect(fireIntensity(60, 0, 1, 1)).toBeGreaterThan(fireIntensity(60, 0, 1, 0.9))
    expect(fireIntensity(lightRadius.x * 1.02, 0, 1.05)).toBeGreaterThan(0)
  })
})

describe('the flicker', () => {
  it('always lands on a known level, the same one for the same tick', () => {
    for (let tick = 0; tick < 200; tick += 1) {
      const level = flickerLevel(tick)
      expect(Number.isInteger(level)).toBe(true)
      expect(level).toBeGreaterThanOrEqual(0)
      expect(level).toBeLessThan(flickerLevels)
      expect(flickerLevel(tick)).toBe(level)
    }
  })

  it('uses more than one level, so the light moves', () => {
    const seen = new Set(Array.from({ length: 100 }, (_, tick) => flickerLevel(tick)))
    expect(seen.size).toBeGreaterThan(2)
  })

  it('swells and brightens with the level', () => {
    const dim = flickerShape(0)
    const bright = flickerShape(flickerLevels - 1)
    expect(bright.radius).toBeGreaterThan(dim.radius)
    expect(bright.peak).toBeGreaterThan(dim.peak)
  })
})

describe('buildPool', () => {
  it('is warm and opaque at the heart and transparent at the corners', () => {
    const { width, height, data } = buildPool(flickerLevels - 1)
    const at = (x: number, y: number) => (y * width + x) * 4
    const centre = at(Math.floor(width / 2), Math.floor(height / 2))
    expect(data[centre + 3]).toBeGreaterThan(220)
    expect(data[centre]).toBeGreaterThan(data[centre + 2])
    expect(data[at(0, 0) + 3]).toBe(0)
    expect(data[at(width - 1, height - 1) + 3]).toBe(0)
  })

  it('has only a few distinct alpha bands, so it reads as pixel art', () => {
    const { data } = buildPool(3)
    const alphas = new Set<number>()
    for (let i = 3; i < data.length; i += 4) alphas.add(data[i])
    expect(alphas.size).toBeLessThanOrEqual(9)
    expect(alphas.size).toBeGreaterThan(3)
  })

  it('takes the colour it is asked for', () => {
    const { width, height, data } = buildPool(2, { r: 10, g: 20, b: 30 })
    const centre = (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4
    expect([data[centre], data[centre + 1], data[centre + 2]]).toEqual([10, 20, 30])
  })
})

describe('bayer', () => {
  it('stays in [0, 1) and repeats every four pixels', () => {
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        expect(bayer(x, y)).toBeGreaterThan(0)
        expect(bayer(x, y)).toBeLessThan(1)
        expect(bayer(x + 4, y + 4)).toBe(bayer(x, y))
      }
    }
  })
})

describe('ambientColour', () => {
  const channels = (css: string) => css.match(/\d+/g)!.map(Number)

  it('starts near the art as drawn and deepens into a cooler, dimmer night', () => {
    const start = channels(ambientColour(0))
    const end = channels(ambientColour(duskDuration))
    expect(start[0]).toBeGreaterThan(end[0])
    expect(start[1]).toBeGreaterThan(end[1])
    // Red and green drain away, blue holds, so the night turns cool rather than just dark.
    expect(end[2] - end[0]).toBeGreaterThan(start[2] - start[0])
    expect(end[2]).toBeGreaterThan(end[0])
  })

  it('does not change once it has settled, and settles at once when asked to', () => {
    expect(ambientColour(duskDuration)).toBe(ambientColour(duskDuration * 3))
    expect(ambientColour(0, true)).toBe(ambientColour(duskDuration))
  })
})

describe('shadowFor', () => {
  const fire = { x: 400, y: 300 }

  it('falls away from the fire, in the direction of the object', () => {
    const left = shadowFor({ x: 300, y: 300 }, fire, 2)!
    const right = shadowFor({ x: 500, y: 300 }, fire, 2)!
    expect(left.shearX).toBeLessThan(0)
    expect(right.shearX).toBeGreaterThan(0)
    const front = shadowFor({ x: 400, y: 340 }, fire, 2)!
    const behind = shadowFor({ x: 400, y: 260 }, fire, 2)!
    expect(front.shearY).toBeGreaterThan(0)
    expect(behind.shearY).toBeLessThan(0)
  })

  it('always has some thickness, even level with the fire', () => {
    const level = shadowFor({ x: 330, y: 300 }, fire, 2)!
    expect(Math.abs(level.shearY)).toBeGreaterThanOrEqual(0.3)
  })

  it('is strongest near the light, longer farther out, and absent where there is no light', () => {
    const near = shadowFor({ x: 440, y: 300 }, fire, 2)!
    const far = shadowFor({ x: 560, y: 300 }, fire, 2)!
    expect(near.alpha).toBeGreaterThan(far.alpha)
    expect(Math.abs(far.shearX)).toBeGreaterThan(Math.abs(near.shearX))
    expect(shadowFor({ x: 1400, y: 300 }, fire, 2)).toBeNull()
  })

  it('measures in art pixels, not device pixels', () => {
    expect(shadowFor({ x: 500, y: 300 }, fire, 4)).not.toBeNull()
    expect(shadowFor({ x: 400 + 126 * 2.2, y: 300 }, fire, 2)).toBeNull()
  })
})
