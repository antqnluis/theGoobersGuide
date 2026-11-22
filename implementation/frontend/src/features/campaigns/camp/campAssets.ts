// Loads the camp art for one world: decode each PNG once, then recolour its
// biome materials from the campaign's planet palette. Sources are cached for
// good; recoloured copies keep only the few most recent worlds.

import type { AdventurerAppearance } from './adventurerAppearance'
import { adventurerSize, renderAdventurer } from './adventurerSprites'
import { assetIdsFor, artUrl } from './campArt'
import { frameSpriteId } from './campParty'
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

const sprites = new Map<string, CampImage>()
const keptSprites = 128

/** A party member's finished sprite on its own canvas, cached by look. */
export function adventurerImage(
  spriteId: string,
  look: AdventurerAppearance,
  frame: 0 | 1 = 0,
): CampImage {
  const cacheKey = frameSpriteId(spriteId, frame)
  let image = sprites.get(cacheKey)
  if (!image) {
    const { width, height } = adventurerSize
    const pixels = Uint32Array.from(renderAdventurer(look, frame))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas is not available')
    context.putImageData(new ImageData(new Uint8ClampedArray(pixels.buffer), width, height), 0, 0)
    image = { source: canvas, width, height }
    sprites.set(cacheKey, image)
    while (sprites.size > keptSprites) sprites.delete(sprites.keys().next().value!)
  }
  return image
}

/** The warm outline drawn around hovered, focused, or open objects. */
export const outlineColour = '#ffe7ac'

const outlines = new WeakMap<object, CampImage>()
const silhouettes = new WeakMap<object, CampImage>()

/**
 * A one-pixel outline around an image's opaque pixels, on a canvas one pixel
 * larger on every side. Only the ring is painted, so it can sit over the object.
 */
export function outlineImage(image: CampImage): CampImage {
  const cached = outlines.get(image)
  if (cached) return cached
  const width = image.width + 2
  const height = image.height + 2
  const read = document.createElement('canvas')
  read.width = width
  read.height = height
  const readContext = read.getContext('2d', { willReadFrequently: true })
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!readContext || !context) throw new Error('Canvas is not available')
  readContext.drawImage(image.source, 1, 1)
  const { data } = readContext.getImageData(0, 0, width, height)
  const solid = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && data[(y * width + x) * 4 + 3] === 255
  context.fillStyle = outlineColour
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (solid(x, y)) continue
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) {
        context.fillRect(x, y, 1, 1)
      }
    }
  }
  const result = { source: canvas, width, height }
  outlines.set(image, result)
  return result
}

/** The image as one flat colour, keeping its shape: what a shadow is cut from. */
export function silhouetteImage(image: CampImage, colour: string): CampImage {
  const cached = silhouettes.get(image)
  if (cached) return cached
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is not available')
  context.drawImage(image.source, 0, 0)
  context.globalCompositeOperation = 'source-in'
  context.fillStyle = colour
  context.fillRect(0, 0, image.width, image.height)
  const result = { source: canvas, width: image.width, height: image.height }
  silhouettes.set(image, result)
  return result
}
