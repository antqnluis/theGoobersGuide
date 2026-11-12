import { clamp } from './orreryCamera'
import type { Box } from './orreryLabels'

export type LeaderPlanet = {
  /** Projected center of the world, in screen pixels. */
  x: number
  y: number
  /** Pixel radius of the world and everything that orbits it. */
  extent: number
}

export type LeaderSegment = { x1: number; y1: number; x2: number; y2: number }

/** Space left between the world's reach and the start of the line. */
export const leaderGap = 4
/** Shorter than this and the line reads as a smudge rather than a pointer. */
export const leaderMinLength = 14

/**
 * The line from an annotation plate to the edge of the world it describes. It
 * starts at the point of the plate nearest the world and stops just outside
 * the world's reach, so it never crosses the world or its moons. Returns null
 * when the plate sits on top of, or too close to, the world to point at it.
 */
export function leaderSegment(planet: LeaderPlanet, plate: Box): LeaderSegment | null {
  const x2 = clamp(planet.x, plate.left, plate.right)
  const y2 = clamp(planet.y, plate.top, plate.bottom)
  const dx = x2 - planet.x
  const dy = y2 - planet.y
  const distance = Math.hypot(dx, dy)
  const start = planet.extent + leaderGap
  if (distance - start < leaderMinLength) return null
  const along = start / distance
  return { x1: planet.x + dx * along, y1: planet.y + dy * along, x2, y2 }
}
