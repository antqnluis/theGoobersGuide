import { describe, expect, it } from 'vitest'
import {
  catalogueNumeral,
  getOrbitTarget,
  maxRings,
  orbitAngle,
  orbitPosition,
  orreryLayout,
  ringCounts,
  ringRadius,
  stepCampaign,
} from './orreryLayout'

function campaignIds(count: number) {
  return Array.from(
    { length: count },
    (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  )
}

const turn = Math.PI * 2

describe('orrery layout', () => {
  it('lays out nothing for an account without campaigns', () => {
    expect(orreryLayout([])).toEqual({ worlds: [], rings: [], extent: 0 })
  })

  it('gives each of the first eight campaigns its own ring, oldest closest to the hearth', () => {
    const ids = campaignIds(maxRings)
    const { worlds, rings, extent } = orreryLayout(ids)

    expect(worlds.map(({ id }) => id)).toEqual(ids)
    expect(worlds.map(({ index }) => index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(worlds.map(({ ring }) => ring)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(rings.map(({ count }) => count)).toEqual([1, 1, 1, 1, 1, 1, 1, 1])
    expect(extent).toBe(rings[7].radius)
    for (const world of worlds) expect(world.radius).toBe(rings[world.ring].radius)
  })

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
    const { rings } = orreryLayout(campaignIds(maxRings))

    expect(rings[0].period).toBeGreaterThanOrEqual(180)
    for (const [ring, { period }] of rings.entries()) {
      if (ring > 0) expect(period).toBeGreaterThan(rings[ring - 1].period)
    }
  })

  it('keeps a world at the same place on its ring when other campaigns change', () => {
    const ids = campaignIds(5)
    const before = orreryLayout(ids).worlds[1]
    const afterNewest = orreryLayout([...ids, 'a-new-campaign']).worlds[1]
    const afterRemoval = orreryLayout(ids.filter((_, index) => index !== 0)).worlds[0]

    expect(afterNewest).toEqual(before)
    expect(afterRemoval.id).toBe(before.id)
    expect(afterRemoval.phase).toBe(before.phase)
    expect(afterRemoval.ring).toBe(before.ring - 1)
  })

  it('spreads phases across the ring instead of lining worlds up', () => {
    const phases = orreryLayout(campaignIds(maxRings)).worlds.map(({ phase }) => phase)

    for (const phase of phases) {
      expect(phase).toBeGreaterThanOrEqual(0)
      expect(phase).toBeLessThan(turn)
    }
    expect(new Set(phases.map((phase) => Math.floor((phase / turn) * 4))).size).toBeGreaterThan(2)
  })

  it('places the ninth campaign on the outermost ring without moving the older worlds', () => {
    const ids = campaignIds(9)
    const eight = orreryLayout(ids.slice(0, 8)).worlds
    const { worlds, rings } = orreryLayout(ids)

    expect(rings).toHaveLength(maxRings)
    expect(worlds.slice(0, 8)).toEqual(eight)
    expect(worlds[8].ring).toBe(7)
    expect(Math.abs(worlds[8].phase - worlds[7].phase)).toBeCloseTo(Math.PI, 10)
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

  it('keeps 32 campaigns in oldest-first ring order with even spacing on shared rings', () => {
    const ids = campaignIds(32)
    const { worlds, rings } = orreryLayout(ids)

    expect(worlds.map(({ id }) => id)).toEqual(ids)
    expect(rings).toHaveLength(maxRings)
    expect(rings.map(({ count }) => count)).toEqual([1, 2, 3, 4, 4, 5, 6, 7])
    for (let index = 1; index < worlds.length; index++) {
      expect(worlds[index].ring).toBeGreaterThanOrEqual(worlds[index - 1].ring)
    }

    for (const [ring, { count, radius }] of rings.entries()) {
      const phases = worlds
        .filter((world) => world.ring === ring)
        .map(({ phase }) => phase)
        .sort((first, second) => first - second)
      expect(phases).toHaveLength(count)
      const separations = phases.map(
        (phase, seat) => (phases[(seat + 1) % count] - phase + turn) % turn || turn,
      )
      for (const separation of separations) expect(separation).toBeCloseTo(turn / count, 10)
      // Neighbours on a ring stay several world-widths apart along the arc.
      expect((turn / count) * radius).toBeGreaterThan(6)
    }
  })

  it('positions worlds on the orbital plane and advances them along the ring over time', () => {
    const [world] = orreryLayout(campaignIds(1)).worlds
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
