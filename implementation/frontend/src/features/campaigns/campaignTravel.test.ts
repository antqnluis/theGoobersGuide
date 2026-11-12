import { describe, expect, it } from 'vitest'
import type { OrbitBounds, OrbitSlot } from './campaignOrbit'
import {
  fitOrbitCenter,
  fitWorldRadius,
  focusPose,
  handoffSlots,
  mix,
  overviewPose,
  projectedSphereExtent,
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

  it('starts a retarget from the live position and brings unseen planets in from the arc', () => {
    const live = { ...focal, x: 500, radius: 68 }
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
