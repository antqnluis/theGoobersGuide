// The camp's firelight: the campfire as a real light source over the pixel art.
// A "light map" canvas is multiplied over the art. It is filled with the night's
// ambient colour, the fire's pool of warm light is laid over it in hard pixel
// bands (an ordered dither between a few steps, so it reads as pixel art rather
// than a smooth glow), and the figures and props cast flattened shadows away from
// the flames. Everything here is pure and deterministic, so tests can check the
// shapes and the renderer holds no animation state.

import { firePit } from './campLayout'
import { hash01 } from './campFx'

/** The centre of the light, in panorama pixels: just above the stone ring, at flame height. */
export const lightCentre = { x: firePit.x, y: 234 } as const

/** Half-size of the pool of light, in base pixels; tall enough to catch standing figures. */
export const lightRadius = { x: 126, y: 78 } as const

/** How many flicker variants of the pool are drawn once and reused. */
export const flickerLevels = 6

/** The number of light bands the pool is quantized into before dithering. */
const bands = 8

/** The most the pool covers the ambient, so the brightest band keeps a hint of the night. */
const peakAlpha = 0.96

/** The light's colour at the heart of the pool (multiplied over the art, it only warms and holds it). */
export const lightColour = { r: 255, g: 238, b: 204 } as const

/** Night ambient, as multipliers of the art's colours: cool and dim. */
const night = { r: 0.6, g: 0.66, b: 0.86 }
/** The first moments of arrival, before the dusk deepens: nearly the art as drawn. */
const dusk = { r: 0.95, g: 0.88, b: 0.84 }

/** How long dusk takes to deepen into night, in milliseconds. */
export const duskDuration = 4500

const bayer4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

/** An ordered-dither threshold in [0, 1) for a pixel. */
export function bayer(x: number, y: number) {
  return (bayer4[(y & 3) * 4 + (x & 3)] + 0.5) / 16
}

/**
 * How strongly the fire lights a point, 0 to 1, from its offset from the centre
 * of the light in base pixels. `radius` and `peak` come from the flicker level.
 */
export function fireIntensity(dx: number, dy: number, radius = 1, peak = 1) {
  const d = Math.hypot(dx / (lightRadius.x * radius), dy / (lightRadius.y * radius))
  if (d >= 1) return 0
  return peak * (1 - d) ** 1.6
}

/** The wobble of one flicker level: the pool breathes in size and brightness. */
export function flickerShape(level: number) {
  const t = level / (flickerLevels - 1)
  return { radius: 0.93 + 0.1 * t, peak: 0.88 + 0.12 * t }
}

/** Which flicker level a tick lands on: a jittered walk, never a regular pulse. */
export function flickerLevel(tick: number) {
  return Math.floor(hash01(tick, 11, 5) * flickerLevels)
}

/**
 * One flicker level of the pool as straight RGBA pixels. Pixels carry the fire's
 * colour; their alpha is the quantized, dithered intensity, so laying the pool over
 * any ambient colour gives an exact blend between the two.
 */
export function buildPool(
  level: number,
  colour: { r: number; g: number; b: number } = lightColour,
) {
  const width = lightRadius.x * 2 + 1
  const height = lightRadius.y * 2 + 1
  const { radius, peak } = flickerShape(level)
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const intensity = fireIntensity(x - lightRadius.x, y - lightRadius.y, radius, peak)
      if (intensity <= 0) continue
      const step = Math.floor(intensity * bands + bayer(x, y))
      if (step <= 0) continue
      const at = (y * width + x) * 4
      data[at] = colour.r
      data[at + 1] = colour.g
      data[at + 2] = colour.b
      data[at + 3] = Math.round((Math.min(step, bands) / bands) * peakAlpha * 255)
    }
  }
  return { width, height, data }
}

/** The ambient colour of the night at `elapsed` ms after arrival, as a CSS colour. */
export function ambientColour(elapsed: number, settled = false) {
  const t = settled ? 1 : Math.min(1, Math.max(0, elapsed / duskDuration))
  // Ease out: the light drains quickly at first, then settles.
  const eased = 1 - (1 - t) ** 2.4
  const mix = (from: number, to: number) => Math.round((from + (to - from) * eased) * 255)
  return `rgb(${mix(dusk.r, night.r)} ${mix(dusk.g, night.g)} ${mix(dusk.b, night.b)})`
}

export type Shadow = {
  /** Horizontal shear of the shadow per unit of height (screen x per screen y of the sprite). */
  shearX: number
  /** Vertical shear: how far up or down the screen the shadow falls per unit of height. */
  shearY: number
  /** Opacity, strongest in the brightest light and gone at its edge. */
  alpha: number
}

/**
 * The shadow of something standing at `foot` (device pixels) in the light of a
 * fire at `fire`. The shadow falls away from the fire, flattened because the
 * ground recedes, and longer the further out the object stands. `scale` is the
 * art's device pixels per base pixel. Returns null where there is no light to cast it.
 */
export function shadowFor(
  foot: { x: number; y: number },
  fire: { x: number; y: number },
  scale: number,
  radius = 1,
  peak = 1,
): Shadow | null {
  const dx = (foot.x - fire.x) / scale
  const dy = (foot.y - fire.y) / scale
  const alpha = fireIntensity(dx, dy * 2.2, radius, peak)
  if (alpha < 0.04) return null
  // Depth on the ground is foreshortened on screen, so a step in y is a long step in depth.
  const away = { x: dx, y: dy * 2.4 }
  const length = Math.hypot(away.x, away.y) || 1
  const direction = { x: away.x / length, y: away.y / length }
  const reach = 0.45 + 0.7 * Math.min(1, length / 90)
  // Never lie perfectly flat: a body has depth, so a shadow level with the fire still has thickness on screen.
  const lean = direction.y >= 0 ? 1 : -1
  return {
    shearX: direction.x * reach,
    shearY: lean * Math.max(0.3, Math.abs(direction.y) * reach * 0.5),
    alpha: Math.min(0.62, alpha * 0.9),
  }
}

/** The warm bloom screened over the lit ground, so the light adds colour as well as holding it. */
export const glowColour = { r: 255, g: 142, b: 58 } as const

/** How much of the bloom shows at its brightest band. */
export const glowStrength = 0.4

/** The colour shadows are cut in: the night's deep blue, as an opaque fill for a silhouette. */
export const shadowColour = '#0a0824'
