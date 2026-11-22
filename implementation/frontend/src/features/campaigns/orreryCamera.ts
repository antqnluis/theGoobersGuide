// Camera math for the orrery. The hearth star is at the origin and the orbits
// lie in the XZ plane. Pure geometry: the rig in useOrreryCamera applies it.

export const cameraFov = 49

/** Room above a world for its label, in pixels. */
export const labelClearance = 30

export type Point = [number, number, number]

export type SceneBounds = { left: number; top: number; width: number; height: number }

export type CameraPose = {
  position: Point
  target: Point
  /** Where the target lands on screen, in pixels from the top left of the canvas. */
  principal: [number, number]
}

/**
 * Sideways pan of the starfield and the strength of its flight streaks.
 * `radial` streaks stars away from the point the camera flies towards.
 */
export type SpaceMotion = { offset: number; streak: number; radial: number }

/**
 * The sign-in arrival, shared between the arrival layer and the camera rig.
 * `waiting` holds the camera far out, `flying` runs the approach, `skipping`
 * cuts the remainder short. `progress` is the share of the flight that has run
 * and `finished` is called once, when the camera has settled on the chart.
 */
export type ArrivalFlight = {
  phase: 'off' | 'waiting' | 'flying' | 'skipping'
  progress: number
  finished: () => void
  /**
   * The doorway's camera, when the sign-in page drew the same sky: the flight then glides
   * from that exact view to the chart instead of arriving from far out.
   */
  from?: CameraPose | null
  /** The doorway's star offset beyond the heading's own, which fades out as the camera glides. */
  carry?: number
}

export const travelDurations = { approach: 0.9, swing: 0.8, retreat: 0.6, skip: 0.35 }

/** Seconds the arrival flight takes from the far pose to the chart. */
export const arrivalDuration = 1.9
/** Seconds the glide from the doorway's view to the chart takes. */
export const glideDuration = 2.4
/** How many times farther than the chart the arrival starts. */
export const arrivalDistance = 6

const turn = Math.PI * 2
const degrees = Math.PI / 180

// The chart is seen from 35 degrees above the orbits. A short, wide scene
// flattens that view and a tall, narrow one steepens it towards top-down.
const chartElevation = 35 * degrees
const shallowElevation = 22 * degrees
const steepElevation = 64 * degrees

// Space kept around the outermost orbit for the worlds that ride on it.
const worldMargin = 0.9
// The smallest system the chart frames, so a lone world is not magnified.
const minChartRadius = 5.2
const chartPadding = 8

// A focused world is seen from the day side, with the hearth off to the left.
const focusPhase = 55 * degrees
const focusElevation = 18 * degrees
const maxFocusRadius = 150
const minFocusRadius = 4

export function mix(from: number, to: number, progress: number) {
  return from + (to - from) * progress
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function travelProgress(elapsed: number, duration: number) {
  const t = clamp(elapsed / duration, 0, 1)
  return t ** 3 * (10 + t * (-15 + 6 * t))
}

export function travelArc(progress: number) {
  return 4 * progress * (1 - progress)
}

/** Pixels per unit of slope: a point one unit off axis at depth one lands this far from the principal point. */
export function focalLength(viewHeight: number) {
  return viewHeight / 2 / Math.tan((cameraFov * degrees) / 2)
}

export function chartElevationFor({ width, height }: SceneBounds) {
  if (width <= 0 || height <= 0) return chartElevation
  const ratio = height / width
  if (ratio > 1) return mix(chartElevation, steepElevation, clamp((ratio - 1) / 0.6, 0, 1))
  return clamp(Math.asin(ratio), shallowElevation, chartElevation)
}

/**
 * The Chart: the whole system seen from above its near side, as large as the
 * clear part of the scene allows.
 */
export function chartPose(extent: number, bounds: SceneBounds, viewHeight: number): CameraPose {
  const focal = focalLength(viewHeight)
  const radius = Math.max(extent + worldMargin, minChartRadius)
  const elevation = chartElevationFor(bounds)
  const sine = Math.sin(elevation)
  const cosine = Math.cos(elevation)
  const top = bounds.top + labelClearance
  const bottom = bounds.top + bounds.height - chartPadding
  const halfWidth = Math.max(1, bounds.width / 2 - chartPadding)
  const halfHeight = Math.max(1, (bottom - top) / 2)

  // The orbit's widest point sits a little towards the camera, and its near
  // side projects lower than its far side projects high.
  const reach = radius * cosine
  const widthFit = Math.hypot((focal * radius) / halfWidth, reach)
  const lift = focal * radius * sine
  const heightFit = (lift + Math.hypot(lift, 2 * halfHeight * reach)) / (2 * halfHeight)
  const distance = Math.max(widthFit, heightFit)
  const near = lift / (distance - reach)
  const far = lift / (distance + reach)

  return {
    position: [0, distance * sine, distance * cosine],
    target: [0, 0, 0],
    principal: [bounds.left + bounds.width / 2, (top + bottom) / 2 - (near - far) / 2],
  }
}

/** Pixel radius of a focused world's envelope: the sphere holding its rings and moons. */
export function focusExtent(bounds: SceneBounds, envelope: number, clearance = labelClearance) {
  return Math.max(
    minFocusRadius * envelope,
    Math.min(
      maxFocusRadius * envelope,
      bounds.width * 0.2 * envelope,
      bounds.width / 2 - chartPadding,
      bounds.height / 2 - clearance,
    ),
  )
}

/**
 * Approach: the world sits at the center of the clear part of the scene, with
 * its envelope and a label above it inside the bounds.
 */
export function focusPose(
  world: Point,
  radius: number,
  envelope: number,
  bounds: SceneBounds,
  viewHeight: number,
  clearance = labelClearance,
): CameraPose {
  const reach = radius * envelope
  const slope = focalLength(viewHeight) / focusExtent(bounds, envelope, clearance)
  const distance = reach * Math.hypot(1, slope)
  const fromHearth = Math.hypot(world[0], world[2])
  const hearthX = fromHearth > 0 ? -world[0] / fromHearth : 0
  const hearthZ = fromHearth > 0 ? -world[2] / fromHearth : 1
  const sine = Math.sin(focusPhase)
  const cosine = Math.cos(focusPhase)
  const level = distance * Math.cos(focusElevation)

  return {
    position: [
      world[0] + level * (hearthX * cosine + hearthZ * sine),
      world[1] + distance * Math.sin(focusElevation),
      world[2] + level * (hearthZ * cosine - hearthX * sine),
    ],
    target: world,
    principal: [bounds.left + bounds.width / 2, bounds.top + bounds.height / 2],
  }
}

/**
 * Arrival easing: a gentle start and a long deceleration, so most of the
 * distance is covered in the first half and the last stretch settles.
 */
export function arrivalEase(elapsed: number, duration = arrivalDuration) {
  const t = clamp(elapsed / duration, 0, 1)
  const smooth = t * t * (3 - 2 * t)
  return 1 - (1 - smooth) ** 3
}

/**
 * The camera on its way in: straight down the chart's line of sight, with the
 * distance closing by a constant ratio so the approach feels even.
 */
export function arrivalPose(chart: CameraPose, eased: number): CameraPose {
  const [tx, ty, tz] = chart.target
  const offset = chart.position.map((value, axis) => value - chart.target[axis]) as Point
  const scale = arrivalDistance ** (1 - clamp(eased, 0, 1))
  return {
    position: [tx + offset[0] * scale, ty + offset[1] * scale, tz + offset[2] * scale],
    target: chart.target,
    principal: chart.principal,
  }
}

/** Radial streak strength: follows the flight's speed, peaks early, gone before the end. */
export function arrivalStreak(elapsed: number, duration = arrivalDuration) {
  const t = clamp(elapsed / duration, 0, 1)
  const smooth = t * t * (3 - 2 * t)
  const speed = 3 * (1 - smooth) ** 2 * 6 * t * (1 - t)
  return clamp(speed / 2.4, 0, 1)
}

/** Share of the system's orbits drawn in, from the hearth outward. */
export function arrivalReveal(elapsed: number, duration = arrivalDuration) {
  const t = clamp(elapsed / duration, 0, 1)
  const part = clamp((t - 0.28) / 0.6, 0, 1)
  return part * part * (3 - 2 * part)
}

function shortestTurn(from: number, to: number) {
  const delta = (to - from) % turn
  return delta > Math.PI ? delta - turn : delta <= -Math.PI ? delta + turn : delta
}

function aroundHearth([x, y, z]: Point) {
  return { radius: Math.hypot(x, z), angle: Math.atan2(z, x), height: y }
}

/**
 * Moves between poses around the hearth instead of through it: distance from
 * the star and height change evenly while the camera swings along the shorter
 * arc, rising over the orbits in between.
 */
export function interpolatePose(from: CameraPose, to: CameraPose, progress: number): CameraPose {
  if (progress <= 0) return from
  if (progress >= 1) return to

  const start = aroundHearth(from.position)
  const end = aroundHearth(to.position)
  const swing = start.radius > 1e-6 && end.radius > 1e-6 ? shortestTurn(start.angle, end.angle) : 0
  const rise = travelArc(progress) * Math.min(2.4, Math.abs(swing) * end.radius * 0.3)

  function along(a: Point, b: Point, lift: number): Point {
    const first = aroundHearth(a)
    const last = aroundHearth(b)
    // A point on the axis has no bearing of its own, so it borrows the other's.
    const firstAngle = first.radius > 1e-6 ? first.angle : last.angle
    const lastAngle = last.radius > 1e-6 ? last.angle : first.angle
    let arc = shortestTurn(firstAngle, lastAngle)
    // Keep the view turning with the camera when its own shorter way round differs.
    if (swing && arc * swing < 0 && Math.abs(arc) > Math.PI / 2) arc += Math.sign(swing) * turn
    const angle = firstAngle + arc * progress
    const radius = mix(first.radius, last.radius, progress)
    return [
      Math.cos(angle) * radius,
      mix(first.height, last.height, progress) + lift,
      Math.sin(angle) * radius,
    ]
  }

  return {
    position: along(from.position, to.position, rise),
    target: along(from.target, to.target, 0),
    principal: [
      mix(from.principal[0], to.principal[0], progress),
      mix(from.principal[1], to.principal[1], progress),
    ],
  }
}

/** Compass bearing of the view: 0 looking down -Z, growing as the camera turns right. */
export function heading({ position, target }: CameraPose) {
  return Math.atan2(target[0] - position[0], position[2] - target[2])
}

/**
 * Starfield pan per radian of heading. The nearest stars cross about one
 * screen in a quarter turn, close to what the camera's field of view implies.
 */
export const starfieldPan = 0.23

/** Continues a heading past ±π so the sky does not jump when the camera faces +Z. */
export function unwrapHeading(previous: number | null, next: number) {
  return previous === null ? next : previous + shortestTurn(previous, next)
}

/** Streak strength for a swing between worlds, signed like the starfield's pan. */
export function swingStreak(from: CameraPose, to: CameraPose, progress: number) {
  if (progress <= 0 || progress >= 1) return 0
  const pan = shortestTurn(heading(from), heading(to))
  // Follow the speed of the flight, not the distance left to travel.
  return Math.sign(pan) * clamp(Math.abs(pan) / 0.5, 0, 1) * 16 * (progress * (1 - progress)) ** 2
}

export type CameraView = {
  /** Projects a world-space point to canvas pixels, with its depth along the view. */
  project(point: Point): { x: number; y: number; depth: number; across: number; up: number }
  focal: number
}

export function cameraView(pose: CameraPose, viewHeight: number): CameraView {
  const focal = focalLength(viewHeight)
  const [px, py, pz] = pose.position
  let fx = pose.target[0] - px
  let fy = pose.target[1] - py
  let fz = pose.target[2] - pz
  const length = Math.hypot(fx, fy, fz) || 1
  fx /= length
  fy /= length
  fz /= length
  // Right is forward × up, with the world's Y axis as up.
  const level = Math.hypot(fx, fz) || 1
  const rx = -fz / level
  const rz = fx / level
  // Up is right × forward.
  const ux = -rz * fy
  const uy = rz * fx - rx * fz
  const uz = rx * fy

  return {
    focal,
    project([x, y, z]) {
      const dx = x - px
      const dy = y - py
      const dz = z - pz
      const depth = dx * fx + dy * fy + dz * fz
      const across = dx * rx + dz * rz
      const up = dx * ux + dy * uy + dz * uz
      return {
        x: pose.principal[0] + (focal * across) / depth,
        y: pose.principal[1] - (focal * up) / depth,
        depth,
        across,
        up,
      }
    },
  }
}

/** How far a sphere reaches from its projected center along one screen axis, in pixels. */
export function projectedSphereExtent(axis: number, depth: number, radius: number, pixels: number) {
  const denominator = depth ** 2 - radius ** 2
  if (denominator <= 0) return Infinity
  const tangent = radius * Math.sqrt(axis ** 2 + denominator)
  const shift = (Math.abs(axis) * radius ** 2) / depth
  return ((tangent + shift) / denominator) * pixels
}
