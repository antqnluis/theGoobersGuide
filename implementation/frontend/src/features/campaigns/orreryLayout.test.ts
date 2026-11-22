import { describe, expect, it } from 'vitest'
import {
  catalogueNumeral,
  galaxyLayout,
  getOrbitTarget,
  maxRings,
  orbitAngle,
  orbitPosition,
  planetKey,
  ringCounts,
  ringRadius,
  stepCampaign,
} from './orreryLayout'

const turn = Math.PI * 2

describe('orrery rings', () => {
  it('grows ring radii outward with tightening gaps that still clear a ringed world', () => {
    const radii = Array.from({ length: maxRings }, (_, ring) => ringRadius(ring))
    const gaps = radii.slice(1).map((radius, ring) => radius - radii[ring])

    expect(radii[0]).toBeGreaterThan(3)
    for (const [ring, gap] of gaps.entries()) {
      expect(gap).toBeGreaterThan(1.4)
      if (ring > 0) expect(gap).toBeLessThan(gaps[ring - 1])
    }
  })

  it('turns outer rings more slowly, with periods measured in minutes', () => {
    const { rings } = galaxyLayout(maxRings)

    expect(rings[0].period).toBeGreaterThanOrEqual(180)
    for (const [ring, { period }] of rings.entries()) {
      if (ring > 0) expect(period).toBeGreaterThan(rings[ring - 1].period)
    }
  })

  it('never crowds an inner ring more than the ring outside it', () => {
    for (let total = 0; total <= 64; total++) {
      const counts = ringCounts(total)

      expect(counts.reduce((sum, count) => sum + count, 0)).toBe(total)
      expect(counts.length).toBe(Math.min(total, maxRings))
      for (let ring = 1; ring < counts.length; ring++) {
        expect(counts[ring]).toBeGreaterThanOrEqual(counts[ring - 1])
      }
    }
  })

  it('spreads phases across the ring instead of lining worlds up', () => {
    const phases = galaxyLayout(maxRings).worlds.map(({ phase }) => phase)

    for (const phase of phases) {
      expect(phase).toBeGreaterThanOrEqual(0)
      expect(phase).toBeLessThan(turn)
    }
    expect(new Set(phases.map((phase) => Math.floor((phase / turn) * 4))).size).toBeGreaterThan(2)
  })

  it('positions worlds on the orbital plane and advances them along the ring over time', () => {
    const [world] = galaxyLayout(1).worlds
    const [x, y, z] = orbitPosition(world)

    expect(y).toBe(0)
    expect(Math.hypot(x, z)).toBeCloseTo(world.radius, 10)
    expect(Math.atan2(z, x)).toBeCloseTo(Math.atan2(Math.sin(world.phase), Math.cos(world.phase)))

    expect(orbitAngle(world, world.period / 4) - orbitAngle(world)).toBeCloseTo(Math.PI / 2, 10)
    const [laterX, , laterZ] = orbitPosition(world, world.period)
    expect(laterX).toBeCloseTo(x, 10)
    expect(laterZ).toBeCloseTo(z, 10)
  })
})

describe('galaxy layout by slot', () => {
  it('lays out nothing for no planets and keys worlds by slot', () => {
    expect(galaxyLayout(0)).toEqual({ worlds: [], rings: [], extent: 0 })
    expect(galaxyLayout(-3)).toEqual({ worlds: [], rings: [], extent: 0 })
    expect(galaxyLayout(3).worlds.map(({ id, index }) => [id, index])).toEqual([
      [planetKey(0), 0],
      [planetKey(1), 1],
      [planetKey(2), 2],
    ])
  })

  it('is deterministic', () => {
    expect(galaxyLayout(14)).toEqual(galaxyLayout(14))
  })

  it('gives each of the first eight slots its own ring, innermost first', () => {
    const { worlds, rings, extent } = galaxyLayout(maxRings)

    expect(worlds.map(({ ring }) => ring)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(rings.map(({ count }) => count)).toEqual([1, 1, 1, 1, 1, 1, 1, 1])
    expect(extent).toBe(rings[7].radius)
    for (const world of worlds) {
      expect(world.radius).toBe(ringRadius(world.ring))
      expect(world.phase).toBeGreaterThanOrEqual(0)
      expect(world.phase).toBeLessThan(turn)
    }
  })

  it('fills rings the way ringCounts does once the first eight are taken', () => {
    for (let total = 0; total <= 40; total++) {
      expect(galaxyLayout(total).rings.map(({ count }) => count)).toEqual(ringCounts(total))
    }
  })

  it('never moves an existing planet when another is added, up to 40 planets', () => {
    let previous = galaxyLayout(0).worlds
    for (let total = 1; total <= 40; total++) {
      const { worlds } = galaxyLayout(total)
      expect(worlds.slice(0, total - 1), `adding planet ${total}`).toEqual(previous)
      previous = worlds
    }
  })

  it('places later planets on a shared ring apart from each other', () => {
    const { worlds, rings } = galaxyLayout(32)
    for (const [ring, { count }] of rings.entries()) {
      const phases = worlds.filter((world) => world.ring === ring).map(({ phase }) => phase)
      expect(phases).toHaveLength(count)
      for (const [first, phase] of phases.entries()) {
        for (const other of phases.slice(first + 1)) {
          const separation = Math.abs(phase - other) % turn
          expect(Math.min(separation, turn - separation)).toBeGreaterThan(0.2)
        }
      }
    }
  })
})

describe('orbit order', () => {
  it('treats the innermost world as focal until a listed campaign is selected', () => {
    expect(getOrbitTarget([], null)).toBeNull()
    expect(getOrbitTarget(['first', 'second'], null)).toBe('first')
    expect(getOrbitTarget(['first', 'second'], 'second')).toBe('second')
    expect(getOrbitTarget(['first'], 'removed')).toBe('first')
  })

  it('steps through the given order and wraps in both directions', () => {
    const ids = ['first', 'second', 'third']
    expect(stepCampaign([], null, 1)).toBeNull()
    expect(stepCampaign(ids, null, 1)).toBe('second')
    expect(stepCampaign(ids, null, -1)).toBe('third')
    expect(stepCampaign(ids, 'removed', 1)).toBe('second')
    expect(stepCampaign(ids, 'first', -1)).toBe('third')
    expect(stepCampaign(ids, 'third', 1)).toBe('first')
    expect(stepCampaign(ids, 'second', 1)).toBe('third')
  })

  it('numbers worlds from the hearth outward in Roman numerals', () => {
    expect([0, 1, 3, 8, 13, 31, 39].map(catalogueNumeral)).toEqual([
      'I',
      'II',
      'IV',
      'IX',
      'XIV',
      'XXXII',
      'XL',
    ])
  })
})
