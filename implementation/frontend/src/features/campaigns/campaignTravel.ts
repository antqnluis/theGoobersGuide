import { orbitLabelClearance, type OrbitBounds, type OrbitSlot } from './campaignOrbit'

export const planetPlane = 5
export const overviewDepth = 33
export const cameraFov = 49

type Point = [number, number, number]

export type CameraPose = { position: Point; lookAt: Point }

export const overviewPose: CameraPose = {
  position: [0, 0, planetPlane + overviewDepth],
  lookAt: [0, 0, planetPlane],
}

export function travelDirection(ids: readonly string[], from: string | null, to: string | null) {
  const start = from === null ? -1 : ids.indexOf(from)
  const end = to === null ? -1 : ids.indexOf(to)
  if (start < 0 || end < 0 || start === end) return 0
  const forward = (end - start + ids.length) % ids.length
  return forward <= ids.length - forward ? 1 : -1
}

export function focusPose(
  selectedId: string | null,
  focal: OrbitSlot | undefined,
  width: number,
  height: number,
): CameraPose {
  if (!selectedId || !focal || height <= 0) return overviewPose

  const units = (2 * overviewDepth * Math.tan((cameraFov * Math.PI) / 360)) / height
  const x = clamp((focal.x - width / 2) * units * 0.26, -2.2, 2.2)
  const y = clamp((height / 2 - focal.y) * units * 0.24, -1.6, 1.6)
  return {
    position: [x * 0.6, y * 0.6, planetPlane + overviewDepth * 0.9],
    lookAt: [x, y, planetPlane],
  }
}

export function mix(from: number, to: number, progress: number) {
  return from + (to - from) * progress
}

export function travelProgress(elapsed: number, duration: number) {
  const t = clamp(elapsed / duration, 0, 1)
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function fitOrbitCenter(
  slot: OrbitSlot,
  bounds: OrbitBounds,
  labelClearance = orbitLabelClearance,
) {
  const padding = 4
  const left = bounds.left + padding
  const right = bounds.left + bounds.width - padding
  const top = bounds.top + labelClearance
  const bottom = bounds.top + bounds.height - padding
  // When a panel reduces the scene mid-flight, bring the globe in from the
  // new edge with enough clearance for a visible portion of its size.
  const inset = Math.max(0, Math.min(slot.radius * 0.35, (right - left) / 8, (bottom - top) / 8))
  const x = clamp(slot.x, left + inset, right - inset)
  const y = clamp(slot.y, top + inset, bottom - inset)
  return { x, y, extent: Math.max(0, Math.min(x - left, right - x, y - top, bottom - y)) }
}

// A sphere fits if its radius is no greater than the distance to all four
// planes through the camera and the edges of the allowed pixel rectangle.
export function fitWorldRadius(
  x: number,
  y: number,
  depth: number,
  slopeX: number,
  slopeY: number,
  marginX: number,
  marginY: number,
  extent: number,
  nominalRadius: number,
) {
  const left = slopeX - marginX
  const right = slopeX + marginX
  const bottom = slopeY - marginY
  const top = slopeY + marginY
  return Math.max(
    0,
    Math.min(
      nominalRadius,
      (x - depth * left) / Math.hypot(1, left) / extent,
      (depth * right - x) / Math.hypot(1, right) / extent,
      (y - depth * bottom) / Math.hypot(1, bottom) / extent,
      (depth * top - y) / Math.hypot(1, top) / extent,
    ),
  )
}

export function projectedSphereExtent(axis: number, depth: number, radius: number, pixels: number) {
  const denominator = depth ** 2 - radius ** 2
  if (denominator <= 0) return Infinity
  const tangent = radius * Math.sqrt(axis ** 2 + denominator)
  const shift = (Math.abs(axis) * radius ** 2) / depth
  return ((tangent + shift) / denominator) * pixels
}

export function handoffSlots(
  current: ReadonlyMap<string, OrbitSlot>,
  destinations: OrbitSlot[],
  ids: readonly string[],
  bounds: OrbitBounds,
  direction: number,
) {
  const focal = destinations[0]
  const tracks = new Map<string, { from: OrbitSlot; to: OrbitSlot }>()
  if (!focal) return tracks

  for (const id of ids) {
    const to = destinations.find((slot) => slot.id === id)
    const from = current.get(id)
    if (!to && !from) continue
    const slot = (to ?? from)!
    const side = slot.offset || (to ? direction || 1 : -(direction || 1))
    const edge = {
      ...slot,
      x: focal.x + side * bounds.width * 0.44,
      y: focal.y - Math.min(bounds.height * 0.16, focal.radius * 0.7),
      radius: 0,
    }
    const start = from ?? edge
    const { x, y } = fitOrbitCenter(start, bounds)
    tracks.set(id, { from: { ...start, x, y }, to: to ?? edge })
  }
  return tracks
}
