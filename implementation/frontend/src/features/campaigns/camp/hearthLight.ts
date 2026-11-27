import { flickerLevels } from './campLight'

/** The dimmest and brightest the fire's light on the journal gets, as a multiple of its resting strength. */
export const hearthRange = { dim: 0.72, bright: 1.25 } as const

/**
 * How strongly the campfire lights the open journal, from the same flicker level that
 * draws the pool of light on the scene, so the book and the camp flicker as one. A flare
 * (the fire swelling after an event) pushes it brighter. Held at its steadiest level when
 * `settled`, which is how reduced motion draws the fire.
 */
export function hearthGlow(level: number, flare = 0, settled = false) {
  const t = settled ? 1 : Math.min(1, Math.max(0, level / (flickerLevels - 1)))
  const base = hearthRange.dim + (1 - hearthRange.dim) * t
  const lit = base + Math.max(0, flare) * 0.25
  return Math.min(hearthRange.bright, Math.max(hearthRange.dim, lit))
}

/** How much of the journal's page the fire reaches, by the place that is open (the fire is the overview's). */
export const hearthStrength: Record<string, number> = {
  overview: 0.16,
  party: 0.14,
  adventures: 0.11,
  notes: 0.11,
  visions: 0.11,
  settings: 0.09,
  characters: 0.08,
}
