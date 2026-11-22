import type { CameraPose } from '../campaigns/orreryCamera'

/**
 * The sign-in sky's view, kept so the galaxy's camera can start from exactly what the
 * person was looking at: where the camera was, where the star landed on screen, and how far
 * the stars had drifted beyond the heading's own pan.
 */
export type SkyHandoff = { pose: CameraPose; carry: number }

let latest: SkyHandoff | null = null

export function publishSkyHandoff(handoff: SkyHandoff) {
  latest = handoff
}

export function clearSkyHandoff() {
  latest = null
}

export function readSkyHandoff() {
  return latest
}
