import type { planetAppearance } from '../planetModel'
import { biomeMaterials, masterBiome, type BiomeMaterial } from './masterPalette'
import { hexToRgb, labToRgb, rgbToHex, rgbToLab, type Lab } from './oklab'

// All camp art is authored in one master palette. Fixed materials (wood, fire,
// cloth, brass, skin) never change. Biome materials act as lookup keys and are
// recoloured at runtime from the campaign's planet palette, so the ground under
// the party is the colour the world had from orbit.

export type CampWorld = Pick<ReturnType<typeof planetAppearance>, 'kind' | 'palette' | 'air'>
export type CampKind = CampWorld['kind']
export type CampRamps = Record<BiomeMaterial, string[]>

type Recipe = readonly [paletteIndex: number, chromaScale: number, lightScale: number]

// Which planet palette entry feeds each material, per world type.
const recipes: Record<CampKind, Record<'ground' | 'foliage' | 'rock', Recipe>> = {
  terrestrial: { ground: [2, 1, 1], foliage: [2, 1, 0.72], rock: [3, 0.4, 1] },
  desert: { ground: [2, 1, 1], foliage: [1, 1, 0.9], rock: [1, 0.7, 1] },
  volcanic: { ground: [1, 1, 0.85], foliage: [2, 0.9, 0.8], rock: [2, 0.35, 1] },
  gas: { ground: [2, 1, 0.9], foliage: [1, 1, 0.9], rock: [3, 0.6, 0.9] },
  frozen: { ground: [3, 0.8, 0.95], foliage: [1, 1, 0.8], rock: [2, 0.7, 0.9] },
  rocky: { ground: [1, 0.9, 1], foliage: [2, 0.8, 0.85], rock: [2, 0.6, 1] },
}

export const biomes: Record<CampKind, { skyline: string; particles: string }> = {
  terrestrial: { skyline: 'grass and pines', particles: 'fireflies' },
  desert: { skyline: 'dunes', particles: 'sand' },
  volcanic: { skyline: 'ash and basalt', particles: 'embers' },
  frozen: { skyline: 'snow', particles: 'snow' },
  rocky: { skyline: 'scree', particles: 'dust' },
  gas: { skyline: 'cloud-reef highland', particles: 'wisps' },
}

const shadowHue = (280 * Math.PI) / 180
const shadowWeights = [0.45, 0.25, 0.08, 0]

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

/**
 * Four shades of one hue lit by night: shadows slide towards blue-violet and
 * the ramp keeps enough lightness spread to stay distinct after rounding.
 */
function makeRamp(hex: string, chromaScale: number, lightScale: number, maxLightness: number) {
  const [lightness, a, b] = rgbToLab(hexToRgb(hex))
  const chroma = Math.hypot(a, b) * chromaScale
  const hue = Math.atan2(b, a)
  const top = clamp(lightness * lightScale * 0.85, 0.34, maxLightness)
  const bottom = Math.max(0.13, top * 0.4)
  return shadowWeights.map((weight, step) => {
    const shade = bottom + (top - bottom) * (step / 3) ** 0.9
    const shadowA = chroma * Math.cos(shadowHue)
    const shadowB = chroma * Math.sin(shadowHue)
    const lab: Lab = [
      shade,
      chroma * Math.cos(hue) * (1 - weight) + shadowA * weight,
      chroma * Math.sin(hue) * (1 - weight) + shadowB * weight,
    ]
    return rgbToHex(labToRgb(lab))
  })
}

function tintTowards(ramp: string[], step: number, target: string, weight: number) {
  const [lightness, a, b] = rgbToLab(hexToRgb(ramp[step]))
  const [, targetA, targetB] = rgbToLab(hexToRgb(target))
  ramp[step] = rgbToHex(
    labToRgb([lightness, a + (targetA - a) * weight, b + (targetB - b) * weight]),
  )
}

/** The runtime ramps for one world: same shape as the master, recoloured. */
export function campRamps(world: CampWorld): CampRamps {
  const recipe = recipes[world.kind]
  const make = (name: 'ground' | 'foliage' | 'rock', cap: number) => {
    const [index, chroma, light] = recipe[name]
    return makeRamp(world.palette[index], chroma, light, cap)
  }
  const sky = makeRamp(world.palette[0], 1, 1, 0.4)
  tintTowards(sky, 2, world.air, 0.25)
  tintTowards(sky, 3, world.air, 0.5)
  return {
    sky,
    haze: makeRamp(world.air, 0.7, 1, 0.55),
    ground: make('ground', 0.62),
    foliage: make('foliage', 0.55),
    rock: make('rock', 0.6),
  }
}

/** Identifies one of the 12 recoloured variants (6 types x 2 palettes). */
export function variantKey(world: Pick<CampWorld, 'kind' | 'palette'>) {
  return `${world.kind}:${world.palette.join('')}`
}

// Pixels are RGBA bytes read as little-endian Uint32 values, which is how
// ImageData behaves on every platform the app targets.
export function packRgba([r, g, b]: readonly [number, number, number], alpha = 255) {
  return ((alpha << 24) | (b << 16) | (g << 8) | r) >>> 0
}

/** Master colour to runtime colour, both packed opaque. */
export function buildSwapLut(ramps: CampRamps): Map<number, number> {
  const lut = new Map<number, number>()
  for (const material of biomeMaterials) {
    masterBiome[material].forEach((master, step) => {
      lut.set(packRgba(hexToRgb(master)), packRgba(hexToRgb(ramps[material][step])))
    })
  }
  return lut
}

/**
 * Recolours opaque master pixels in place. Transparent, partially transparent,
 * and unmatched pixels pass through unchanged.
 */
export function applyPaletteSwap(pixels: Uint32Array, lut: ReadonlyMap<number, number>) {
  for (let index = 0; index < pixels.length; index += 1) {
    const pixel = pixels[index]
    if (pixel >>> 24 !== 255) continue
    const replacement = lut.get(pixel)
    if (replacement !== undefined) pixels[index] = replacement
  }
}

export { biomeMaterials, masterBiome, masterColors, masterFixed } from './masterPalette'
export type { BiomeMaterial } from './masterPalette'
