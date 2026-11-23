// A player's own sprite for their seat at the camp: 16x16, or 32x32 for more detail. It is
// stored as the sprite's straight RGBA bytes in base64 (1368 characters for 16x16, 5464 for
// 32x32). A 16x16 sprite stands as tall as the built-in adventurers; a 32x32 one is drawn
// at 24 art pixels, so it draws, flips, casts a shadow, and outlines like them.

/** Edge lengths a sprite may have, in pixels. */
export const spriteSizes = [16, 32] as const
export type SpriteSize = (typeof spriteSizes)[number]

/** The size the camp draws a sprite at, in art pixels (whole numbers, to stay on the grid). */
export function spriteFootprint(size: number) {
  return size === 32 ? 24 : size
}

/** Largest PNG file read when choosing a sprite; a 32x32 image is a few kilobytes. */
export const maxSpriteFileBytes = 64 * 1024

const bytesFor = (size: number) => size * size * 4
// base64 of n bytes is 4 * ceil(n / 3) characters; both sizes end in two "=" padding marks.
const lengthFor = (size: number) => 4 * Math.ceil(bytesFor(size) / 3)
const encodedPattern = /^[A-Za-z0-9+/]+==$/

/** Straight RGBA bytes as base64, or null unless they are exactly one sprite. */
export function encodeSprite(rgba: ArrayLike<number>): string | null {
  if (!spriteSizes.some((size) => rgba.length === bytesFor(size))) return null
  let binary = ''
  for (let index = 0; index < rgba.length; index += 1) binary += String.fromCharCode(rgba[index])
  return btoa(binary)
}

export type DecodedSprite = { pixels: Uint32Array<ArrayBuffer>; size: SpriteSize }

/** The packed pixels and edge length of a stored sprite, or null for anything else. */
export function decodeSprite(encoded: string): DecodedSprite | null {
  const size = spriteSizes.find((candidate) => encoded.length === lengthFor(candidate))
  if (!size || !encodedPattern.test(encoded)) return null
  let binary: string
  try {
    binary = atob(encoded)
  } catch {
    return null
  }
  if (binary.length !== bytesFor(size)) return null
  const bytes = new Uint8ClampedArray(bytesFor(size))
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = binary.charCodeAt(index)
  // Little-endian packing, the same layout as ImageData.
  return { pixels: new Uint32Array(bytes.buffer), size }
}

/**
 * Makes an image's pixels camp-ready: each pixel is fully opaque or fully transparent
 * (the outline only traces opaque pixels), and transparent pixels carry no colour.
 */
export function flattenAlpha(rgba: ArrayLike<number>): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length)
  for (let index = 0; index + 3 < rgba.length; index += 4) {
    if (rgba[index + 3] < 128) continue
    out[index] = rgba[index]
    out[index + 1] = rgba[index + 1]
    out[index + 2] = rgba[index + 2]
    out[index + 3] = 255
  }
  return out
}

/** Whether any pixel is visible; a blank image is not a sprite. */
export function hasVisiblePixels(rgba: ArrayLike<number>) {
  for (let index = 3; index < rgba.length; index += 4) if (rgba[index] !== 0) return true
  return false
}

/**
 * The exhale frame: everything above the feet sinks about one art pixel (one sprite pixel at
 * 16x16, two at 32x32), as for the built-in adventurers, whose last three rows stay put.
 */
export function exhaleSprite({ pixels, size }: DecodedSprite): Uint32Array<ArrayBuffer> {
  const unit = size / 16
  const out = pixels.slice()
  for (let y = 0; y < size - 3 * unit; y += 1) {
    for (let x = 0; x < size; x += 1) {
      out[y * size + x] = y < unit ? 0 : pixels[(y - unit) * size + x]
    }
  }
  return out
}

/** A short stable tag of a stored sprite, so a changed sprite gets a new image id. */
export function spriteTag(encoded: string) {
  let value = 2166136261
  for (let index = 0; index < encoded.length; index += 1) {
    value = Math.imul(value ^ encoded.charCodeAt(index), 16777619)
  }
  return (value >>> 0).toString(36)
}

export type SpriteFileResult = { ok: true; encoded: string } | { ok: false; reason: string }

/** Reads a chosen file: a PNG of exactly 16x16 or 32x32 pixels with something visible. */
export async function readSpriteFile(file: File): Promise<SpriteFileResult> {
  if (file.type !== 'image/png') return { ok: false, reason: 'Choose a PNG image.' }
  if (file.size > maxSpriteFileBytes) return { ok: false, reason: 'That file is too large.' }
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, {
      colorSpaceConversion: 'none',
      premultiplyAlpha: 'none',
    })
  } catch {
    return { ok: false, reason: "That file isn't a readable PNG image." }
  }
  try {
    const { width, height } = bitmap
    if (width !== height || !spriteSizes.some((size) => size === width)) {
      return {
        ok: false,
        reason: 'The sprite must be exactly 32 × 32 pixels (16 × 16 also works).',
      }
    }
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return { ok: false, reason: "This browser can't read images." }
    context.drawImage(bitmap, 0, 0)
    const flat = flattenAlpha(context.getImageData(0, 0, width, height).data)
    if (!hasVisiblePixels(flat)) return { ok: false, reason: 'That image is empty.' }
    const encoded = encodeSprite(flat)
    return encoded ? { ok: true, encoded } : { ok: false, reason: 'That image is not usable.' }
  } finally {
    bitmap.close()
  }
}

/**
 * A prompt to paste into an image generator. Generators rarely hit an exact pixel grid, so
 * it asks for a large nearest-neighbour sprite that is scaled down to 32 × 32 afterwards.
 */
export const spritePrompt = [
  'Pixel art sprite of [describe your character: race, cloak colour, hat, gear], sitting cross-legged on the ground by a campfire, side view facing right, whole body in frame.',
  'Crisp readable pixels on a strict 32 x 32 grid (shown at 512 x 512, each pixel a flat 16 x 16 block), a limited palette of 12 to 16 colours, one-pixel dark outline, no anti-aliasing, no gradients, no shading blur.',
  'Fully transparent background (PNG with alpha), no ground, no shadow, no text, no border. The feet sit on the bottom row of the image and the sprite fills the canvas.',
].join(' ')
