// Loads the camp art for one world: decode each PNG once, then recolour its
// biome materials from the campaign's planet palette. Sources are cached for
// good; recoloured copies keep only the few most recent worlds.

import { assetIdsFor, artUrl } from './campArt'
import {
  applyPaletteSwap,
  buildSwapLut,
  campRamps,
  variantKey,
  type CampWorld,
} from './campPalette'

export type CampImage = { source: CanvasImageSource; width: number; height: number }
export type CampImages = Record<string, CampImage>

type Decoded = { width: number; height: number; pixels: Uint32Array }

const decoded = new Map<string, Promise<Decoded>>()
const recoloured = new Map<string, Promise<CampImages>>()
const keptWorlds = 3

async function decodeBitmap(
  blob: Blob,
): Promise<CanvasImageSource & { width: number; height: number }> {
  try {
    // Straight pixels, no colour conversion: the palette swap needs exact values.
    return await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })
  } catch {
    const image = new Image()
    const url = URL.createObjectURL(blob)
    try {
      image.src = url
      await image.decode()
      return image
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}

function decode(id: string): Promise<Decoded> {
  let pending = decoded.get(id)
  if (!pending) {
    pending = (async () => {
      const response = await fetch(artUrl(id))
      if (!response.ok) throw new Error(`Could not load camp art "${id}"`)
      const bitmap = await decodeBitmap(await response.blob())
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) throw new Error('Canvas is not available')
      context.drawImage(bitmap, 0, 0)
      const { data, width, height } = context.getImageData(0, 0, bitmap.width, bitmap.height)
      return { width, height, pixels: new Uint32Array(data.buffer.slice(0)) }
    })()
    pending.catch(() => decoded.delete(id))
    decoded.set(id, pending)
  }
  return pending
}

function recolour({ width, height, pixels }: Decoded, lut: Map<number, number>): CampImage {
  const copy = Uint32Array.from(pixels)
  applyPaletteSwap(copy, lut)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is not available')
  context.putImageData(new ImageData(new Uint8ClampedArray(copy.buffer), width, height), 0, 0)
  return { source: canvas, width, height }
}

export function loadCampImages(world: CampWorld): Promise<CampImages> {
  const key = variantKey(world)
  let pending = recoloured.get(key)
  if (!pending) {
    const lut = buildSwapLut(campRamps(world))
    const ids = assetIdsFor(world.kind)
    pending = Promise.all(ids.map((id) => decode(id))).then((sources) =>
      Object.fromEntries(ids.map((id, index) => [id, recolour(sources[index], lut)])),
    )
    pending.catch(() => recoloured.delete(key))
    recoloured.set(key, pending)
    while (recoloured.size > keptWorlds) recoloured.delete(recoloured.keys().next().value!)
  }
  return pending
}
