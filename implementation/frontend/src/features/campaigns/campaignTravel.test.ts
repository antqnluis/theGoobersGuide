import { describe, expect, it } from 'vitest'
import type { OrbitBounds, OrbitSlot } from './campaignOrbit'
import {
  fitOrbitCenter,
  fitWorldRadius,
  flybyPlane,
  focusPose,
  glidePose,
  glideStrength,
  handoffSlots,
  interpolatePose,
  mix,
  orbitPlane,
  overviewPose,
  planetPlane,
  projectedSphereExtent,
  travelArc,
  travelDirection,
  travelProgress,
} from './campaignTravel'

describe('guided campaign travel', () => {
  const desktop = { left: 320, top: 72, width: 710, height: 810 }
  const focal = { id: 'a', x: 675, y: 477, radius: 130, offset: 0 } satisfies OrbitSlot

  it('dollies when selecting the overview planet without changing its ID', () => {
    const overview = focusPose(null, focal, 1440, 960)
    const selected = focusPose(focal.id, focal, 1440, 960)

    expect(overview).toEqual(overviewPose)
    expect(selected.position[2]).toBeLessThan(overview.position[2])
    expect(selected.lookAt[0]).toBeLessThan(0)
  })

  it('chooses the shortest wrapped direction and goes forward on a tie', () => {
    const ids = ['a', 'b', 'c', 'd']
    expect(travelDirection(ids, 'd', 'a')).toBe(1)
    expect(travelDirection(ids, 'a', 'd')).toBe(-1)
    expect(travelDirection(ids, 'a', 'c')).toBe(1)
    expect(travelDirection(ids, 'a', 'a')).toBe(0)
  })

  it('glides in opposite directions between campaigns with identical camera endpoints', () => {
    const from = focusPose('a', focal, 1440, 960)
    const to = focusPose('b', { ...focal, id: 'b' }, 1440, 960)
    expect(to).toEqual(from)

    const midpoint = interpolatePose(from, to, travelProgress(0.3, 0.6))
    const forward = glidePose(midpoint, 0.5, 1, glideStrength(desktop))
    const reverse = glidePose(midpoint, 0.5, -1, glideStrength(desktop))
    expect(forward.position[0]).toBeGreaterThan(from.position[0])
    expect(reverse.position[0] - from.position[0]).toBeCloseTo(
      from.position[0] - forward.position[0],
    )
    expect(forward.position[2]).toBeGreaterThan(from.position[2])
    expect(forward.position[2]).toBe(reverse.position[2])
    expect(glidePose(from, 0, 1, 1)).toEqual(from)
    expect(glidePose(to, 1, 1, 1)).toEqual(to)

    const compact = glideStrength({ ...desktop, height: 113 })
    const compactMidpoint = glidePose(midpoint, 0.5, 1, compact)
    expect(compactMidpoint.position[0]).toBeGreaterThan(from.position[0])
    expect(compactMidpoint.position[0]).toBeLessThan(forward.position[0])

    const restarted = interpolatePose(forward, to, travelProgress(0, 0.6))
    expect(glidePose(restarted, 0, -1, 1)).toEqual(forward)
  })

  it('starts a retarget from the live position and brings unseen planets in from the arc', () => {
    const live = { ...focal, x: 500, radius: 68, plane: planetPlane + 0.4 }
    const second = { ...focal, id: 'b', offset: 1, x: 840 } satisfies OrbitSlot
    const third = { ...focal, id: 'c' }
    const tracks = handoffSlots(
      new Map([['a', live]]),
      [third, second],
      ['c', 'b', 'a'],
      desktop,
      -1,
    )
    expect(tracks.get('a')?.from).toEqual(live)
    expect(tracks.get('a')?.to.radius).toBe(0)
    expect(tracks.get('c')?.from.x).toBeLessThan(third.x)
    expect(tracks.get('c')?.to).toEqual(third)
    expect(mix(live.x, focal.x, travelProgress(0, 0.6))).toBe(live.x)
    expect(travelProgress(0.6, 0.6)).toBe(1)
  })

  it('separates the outgoing and incoming worlds in depth and preserves a live handoff', () => {
    const neighbor = { ...focal, id: 'b', offset: 1 } satisfies OrbitSlot
    const arc = travelArc(0.5)
    const outgoing = flybyPlane(focal, neighbor, 0.5, arc, 1)
    const incoming = flybyPlane(neighbor, focal, 0.5, arc, -1)

    expect(outgoing).toBeLessThan(orbitPlane(neighbor))
    expect(incoming).toBeGreaterThan(orbitPlane(focal))
    expect(flybyPlane({ ...neighbor, plane: outgoing }, focal, 0, 0, -1)).toBe(outgoing)
    expect(flybyPlane({ ...neighbor, plane: outgoing }, focal, 1, 0, -1)).toBe(orbitPlane(focal))
  })

  it.each([
    [desktop, 1.08],
    [desktop, 1.82],
    [{ left: 14, top: 230, width: 347, height: 113 }, 1.08],
    [{ left: 14, top: 230, width: 347, height: 113 }, 1.82],
  ] satisfies [OrbitBounds, number][])(
    'fits projected geometry with space for the label',
    (bounds, envelope) => {
      const { extent, x, y } = fitOrbitCenter(
        {
          ...focal,
          x: bounds.left + bounds.width / 2,
          y: bounds.top + bounds.height / 2,
        },
        bounds,
      )
      expect(x).toBe(bounds.left + bounds.width / 2)
      expect(y).toBe(bounds.top + bounds.height / 2)

      const depth = 29
      const slopeX = 0.17
      const slopeY = -0.11
      const pixels = 620
      const radius = fitWorldRadius(
        slopeX * depth,
        slopeY * depth,
        depth,
        slopeX,
        slopeY,
        extent / pixels,
        extent / pixels,
        envelope,
        10,
      )
      expect(radius).toBeGreaterThan(0)
      expect(
        projectedSphereExtent(slopeX * depth, depth, radius * envelope, pixels),
      ).toBeLessThanOrEqual(extent + 1e-9)
      expect(
        projectedSphereExtent(slopeY * depth, depth, radius * envelope, pixels),
      ).toBeLessThanOrEqual(extent + 1e-9)
    },
  )
})
