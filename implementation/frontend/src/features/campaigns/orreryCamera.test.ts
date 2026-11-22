import { describe, expect, it } from 'vitest'
import {
  arrivalDistance,
  arrivalEase,
  arrivalPose,
  arrivalReveal,
  arrivalStreak,
  cameraView,
  chartElevationFor,
  chartPose,
  focusExtent,
  focusPose,
  heading,
  interpolatePose,
  labelClearance,
  projectedSphereExtent,
  starfieldPan,
  swingStreak,
  travelProgress,
  unwrapHeading,
  type Point,
  type SceneBounds,
} from './orreryCamera'
import { galaxyLayout, orbitPosition, ringRadius } from './orreryLayout'

const viewHeight = 960
const desktop = { left: 336, top: 76, width: 1068, height: 800 }
const phone = { left: 14, top: 230, width: 347, height: 113 }
const portrait = { left: 14, top: 120, width: 347, height: 560 }

function ringPoints(radius: number): Point[] {
  return Array.from({ length: 72 }, (_, index) => {
    const angle = (index / 72) * Math.PI * 2
    return [Math.cos(angle) * radius, 0, Math.sin(angle) * radius]
  })
}

describe('the chart', () => {
  it.each([
    ['six planets, the smallest galaxy, on a desktop', 6, desktop, 960],
    ['eight rings on a desktop', 8, desktop, 960],
    ['thirty-two worlds in a short phone scene', 32, phone, 568],
    ['eight rings in a tall phone scene', 8, portrait, 800],
  ] satisfies [string, number, SceneBounds, number][])(
    'fits %s inside the clear part of the scene',
    (_, campaigns, bounds, height) => {
      const { extent } = galaxyLayout(campaigns)
      const view = cameraView(chartPose(extent, bounds, height), height)
      const points = ringPoints(extent).map((point) => view.project(point))

      for (const { x, y, depth } of points) {
        expect(depth).toBeGreaterThan(0)
        expect(x).toBeGreaterThanOrEqual(bounds.left)
        expect(x).toBeLessThanOrEqual(bounds.left + bounds.width)
        expect(y).toBeGreaterThanOrEqual(bounds.top + labelClearance)
        expect(y).toBeLessThanOrEqual(bounds.top + bounds.height)
      }
      // The orbits are centered in the scene, not on the star.
      const xs = points.map(({ x }) => x)
      expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(bounds.left + bounds.width / 2, 6)
    },
  )

  it('fills the scene along its tighter axis instead of floating small', () => {
    const { extent } = galaxyLayout(8)
    const edge = ringPoints(extent + 0.9)

    const wide = cameraView(chartPose(extent, desktop, viewHeight), viewHeight)
    const xs = edge.map((point) => wide.project(point).x)
    expect(Math.min(...xs)).toBeCloseTo(desktop.left + 8, 0)
    expect(Math.max(...xs)).toBeCloseTo(desktop.left + desktop.width - 8, 0)

    const short = cameraView(chartPose(extent, phone, 568), 568)
    const ys = edge.map((point) => short.project(point).y)
    expect(Math.min(...ys)).toBeCloseTo(phone.top + labelClearance, 4)
    expect(Math.max(...ys)).toBeCloseTo(phone.top + phone.height - 8, 4)
  })

  it('does not magnify a lone world or an empty system', () => {
    const empty = chartPose(0, desktop, viewHeight)
    const lone = chartPose(ringRadius(0), desktop, viewHeight)
    expect(lone.position).toEqual(empty.position)
    expect(chartPose(ringRadius(3), desktop, viewHeight).position[1]).toBeGreaterThan(
      lone.position[1],
    )
  })

  it('looks from 35 degrees, flatter for a wide scene and steeper for a tall one', () => {
    const degrees = (bounds: SceneBounds) => (chartElevationFor(bounds) * 180) / Math.PI
    expect(degrees(desktop)).toBeCloseTo(35)
    expect(degrees(phone)).toBeCloseTo(22)
    expect(degrees(portrait)).toBeGreaterThan(60)
    expect(degrees({ ...desktop, height: 0 })).toBeCloseTo(35)
  })
})

describe('approaching a world', () => {
  const world = orbitPosition({ radius: ringRadius(2), phase: 2.1, period: 300 })

  it.each([
    ['desktop', desktop, 960, 2.25],
    ['short phone scene', phone, 568, 2.25],
    ['tall phone scene', portrait, 800, 1.85],
  ] satisfies [string, SceneBounds, number, number][])(
    'centers the world in a %s with room for its moons and label',
    (_, bounds, height, envelope) => {
      const radius = 0.38
      const pose = focusPose(world, radius, envelope, bounds, height)
      const view = cameraView(pose, height)
      const { x, y, depth, across, up } = view.project(world)
      expect(x).toBeCloseTo(bounds.left + bounds.width / 2, 6)
      expect(y).toBeCloseTo(bounds.top + bounds.height / 2, 6)

      const extent = projectedSphereExtent(across, depth, radius * envelope, view.focal)
      expect(extent).toBeCloseTo(focusExtent(bounds, envelope), 6)
      expect(projectedSphereExtent(up, depth, radius * envelope, view.focal)).toBeCloseTo(extent, 6)
      expect(x - extent).toBeGreaterThanOrEqual(bounds.left)
      expect(x + extent).toBeLessThanOrEqual(bounds.left + bounds.width)
      expect(y - extent - labelClearance).toBeGreaterThanOrEqual(bounds.top - 1e-6)
      expect(y + extent).toBeLessThanOrEqual(bounds.top + bounds.height)
    },
  )

  it('shows the day side with the hearth off to the left', () => {
    const pose = focusPose(world, 0.38, 1.85, desktop, viewHeight)
    const towardCamera = pose.position.map((value, axis) => value - world[axis])
    const towardHearth = world.map((value) => -value)
    const dot = towardCamera.reduce((sum, value, axis) => sum + value * towardHearth[axis], 0)
    expect(dot).toBeGreaterThan(0)
    expect(pose.position[1]).toBeGreaterThan(0)

    // The hearth is behind the camera, on the side the light comes from.
    const hearth = cameraView(pose, viewHeight).project([0, 0, 0])
    expect(hearth.depth).toBeLessThan(0)
    expect(hearth.across).toBeLessThan(0)
  })

  it('draws a focused world larger than it is on the chart', () => {
    const chart = cameraView(chartPose(ringRadius(2), desktop, viewHeight), viewHeight)
    const focus = cameraView(focusPose(world, 0.38, 1.85, desktop, viewHeight), viewHeight)
    expect(focus.project(world).depth).toBeLessThan(chart.project(world).depth / 2)
  })

  it('frames a world at the hearth without dividing by zero', () => {
    const pose = focusPose([0, 0, 0], 0.38, 1.85, desktop, viewHeight)
    expect(pose.position.every(Number.isFinite)).toBe(true)
  })
})

describe('travel', () => {
  const chart = chartPose(ringRadius(3), desktop, viewHeight)
  const near = focusPose([ringRadius(1), 0, 0], 0.38, 1.85, desktop, viewHeight)
  const far = focusPose([-ringRadius(3), 0, 0.4], 0.38, 1.85, desktop, viewHeight)
  const fromHearth = ([x, , z]: Point) => Math.hypot(x, z)

  it('starts and ends exactly on its poses', () => {
    expect(interpolatePose(chart, near, 0)).toBe(chart)
    expect(interpolatePose(chart, near, 1)).toBe(near)
    expect(travelProgress(0, 0.8)).toBe(0)
    expect(travelProgress(0.8, 0.8)).toBe(1)
    expect(travelProgress(0.4, 0.8)).toBeCloseTo(0.5)
  })

  it('swings around the hearth between worlds on opposite sides instead of through it', () => {
    const closest = Math.min(fromHearth(near.position), fromHearth(far.position))
    for (let step = 1; step < 20; step++) {
      const pose = interpolatePose(near, far, step / 20)
      expect(fromHearth(pose.position)).toBeGreaterThanOrEqual(closest - 1e-9)
      expect(pose.position[1]).toBeGreaterThanOrEqual(
        Math.min(near.position[1], far.position[1]) - 1e-9,
      )
      // The view keeps to the orbits the whole way round.
      expect(fromHearth(pose.target)).toBeGreaterThanOrEqual(ringRadius(1) - 1e-9)
    }
    const midway = interpolatePose(near, far, 0.5)
    expect(midway.position[1]).toBeGreaterThan(Math.max(near.position[1], far.position[1]))
  })

  it('takes the shorter way round and mirrors it on the way back', () => {
    const out = interpolatePose(near, far, 0.25)
    const back = interpolatePose(far, near, 0.75)
    out.position.forEach((value, axis) => expect(back.position[axis]).toBeCloseTo(value, 9))
    out.target.forEach((value, axis) => expect(back.target[axis]).toBeCloseTo(value, 9))
  })

  it('pulls back and rises when returning to the chart', () => {
    const heights = [0, 0.25, 0.5, 0.75, 1].map(
      (progress) => interpolatePose(near, chart, progress).position[1],
    )
    expect(heights).toEqual([...heights].sort((a, b) => a - b))
    const halfway = interpolatePose(near, chart, 0.5)
    expect(halfway.principal[0]).toBeCloseTo((near.principal[0] + chart.principal[0]) / 2)
  })

  it('streaks the stars in the direction they pan, only while a swing is under way', () => {
    const pan = heading(far) - heading(near)
    expect(swingStreak(near, far, 0)).toBe(0)
    expect(swingStreak(near, far, 1)).toBe(0)
    expect(Math.sign(swingStreak(near, far, 0.5))).toBe(
      Math.sign(Math.atan2(Math.sin(pan), Math.cos(pan))),
    )
    expect(swingStreak(far, near, 0.5)).toBeCloseTo(-swingStreak(near, far, 0.5))
    expect(Math.abs(swingStreak(near, far, 0.5))).toBeLessThanOrEqual(1)
    expect(swingStreak(near, near, 0.5)).toBe(0)
  })

  it('keeps the sky continuous when the camera turns past due south', () => {
    expect(heading(chart)).toBeCloseTo(0)
    expect(unwrapHeading(null, 3)).toBe(3)
    expect(unwrapHeading(3, -3)).toBeCloseTo(Math.PI * 2 - 3)
    expect(unwrapHeading(Math.PI * 2 - 3, 3)).toBeCloseTo(3)
    // Coming back the way it went restores the same sky.
    const there = unwrapHeading(heading(near), heading(far))
    expect(unwrapHeading(there, heading(near)) * starfieldPan).toBeCloseTo(
      heading(near) * starfieldPan,
      12,
    )
  })
})

describe('arrival flight', () => {
  const chart = chartPose(8, desktop, viewHeight)

  it('starts far out on the chart line of sight and ends on the chart', () => {
    const far = arrivalPose(chart, 0)
    const near = arrivalPose(chart, 1)
    expect(near.position).toEqual(chart.position)
    expect(far.target).toEqual(chart.target)
    expect(far.principal).toEqual(chart.principal)
    expect(Math.hypot(...far.position) / Math.hypot(...chart.position)).toBeCloseTo(arrivalDistance)
    // The direction from the hearth never changes: the camera only closes in.
    expect(far.position[1] / far.position[2]).toBeCloseTo(chart.position[1] / chart.position[2])
  })

  it('closes most of the distance early and decelerates into the chart', () => {
    expect(arrivalEase(0)).toBe(0)
    expect(arrivalEase(1.9)).toBe(1)
    expect(arrivalEase(0.95)).toBeGreaterThan(0.8)
    const steps = [0.2, 0.4, 0.6, 0.8, 1].map((t) => arrivalEase(t * 1.9))
    steps.reduce((previous, value) => {
      expect(value).toBeGreaterThan(previous)
      return value
    }, 0)
    expect(steps[4] - steps[3]).toBeLessThan(steps[1] - steps[0])
  })

  it('streaks mid-flight, never at rest, and draws orbits in late', () => {
    expect(arrivalStreak(0)).toBe(0)
    expect(arrivalStreak(1.9)).toBe(0)
    expect(arrivalStreak(0.47)).toBeGreaterThan(0.9)
    expect(arrivalStreak(1.4)).toBeLessThan(0.15)
    expect(arrivalReveal(0)).toBe(0)
    expect(arrivalReveal(0.2 * 1.9)).toBe(0)
    expect(arrivalReveal(1.9)).toBe(1)
  })
})
