import { describe, expect, it } from 'vitest'
import {
  decodeSprite,
  encodeSprite,
  exhaleSprite,
  flattenAlpha,
  hasVisiblePixels,
  spriteFootprint,
  spriteTag,
} from './customSprite'

function sprite(fill: (x: number, y: number) => [number, number, number, number], size = 16) {
  const rgba = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) rgba.set(fill(x, y), (y * size + x) * 4)
  }
  return rgba
}

describe('customSprite', () => {
  it('stores a sprite as 1368 base64 characters and reads the same pixels back', () => {
    const rgba = sprite((x, y) => [x * 10, y * 10, 7, x === 0 ? 0 : 255])
    const encoded = encodeSprite(rgba)
    expect(encoded).toHaveLength(1368)
    const decoded = decodeSprite(encoded!)
    expect(decoded?.size).toBe(16)
    expect(Array.from(new Uint8ClampedArray(decoded!.pixels.buffer))).toEqual(Array.from(rgba))
  })

  it('stores a 32x32 sprite as 5464 base64 characters and reads it back', () => {
    const rgba = sprite((x, y) => [x * 7, y * 7, 9, (x + y) % 3 === 0 ? 0 : 255], 32)
    const encoded = encodeSprite(rgba)
    expect(encoded).toHaveLength(5464)
    const decoded = decodeSprite(encoded!)
    expect(decoded?.size).toBe(32)
    expect(Array.from(new Uint8ClampedArray(decoded!.pixels.buffer))).toEqual(Array.from(rgba))
  })

  it('stores a 64x64 sprite as 21848 base64 characters and reads it back', () => {
    const rgba = sprite((x, y) => [x * 3, y * 3, 9, (x + y) % 5 === 0 ? 0 : 255], 64)
    const encoded = encodeSprite(rgba)
    expect(encoded).toHaveLength(21848)
    const decoded = decodeSprite(encoded!)
    expect(decoded?.size).toBe(64)
    expect(Array.from(new Uint8ClampedArray(decoded!.pixels.buffer))).toEqual(Array.from(rgba))
  })

  it('draws bigger sprites larger, but within the 30-pixel seat spacing', () => {
    expect(spriteFootprint(16)).toBe(16)
    expect(spriteFootprint(32)).toBe(24)
    expect(spriteFootprint(64)).toBe(28)
  })

  it('refuses anything that is not exactly one 16x16 sprite', () => {
    expect(encodeSprite(new Uint8ClampedArray(24 * 24 * 4))).toBeNull()
    expect(encodeSprite(new Uint8ClampedArray(128 * 128 * 4))).toBeNull()
    expect(decodeSprite('A'.repeat(5462) + '==')).not.toBeNull()
    expect(decodeSprite('A'.repeat(2000))).toBeNull()
    expect(decodeSprite('')).toBeNull()
    expect(decodeSprite('A'.repeat(1368))).toBeNull()
    expect(decodeSprite(`${'A'.repeat(1366)}==`)).not.toBeNull()
    expect(decodeSprite(`${'A'.repeat(1366)}!!`)).toBeNull()
  })

  it('makes every pixel fully opaque or fully transparent', () => {
    const flat = flattenAlpha([10, 20, 30, 200, 40, 50, 60, 127, 70, 80, 90, 0])
    expect(Array.from(flat)).toEqual([10, 20, 30, 255, 0, 0, 0, 0, 0, 0, 0, 0])
  })

  it('tells a blank image from a sprite', () => {
    expect(hasVisiblePixels(sprite(() => [0, 0, 0, 0]))).toBe(false)
    expect(hasVisiblePixels(sprite((x, y) => [1, 1, 1, x === 3 && y === 4 ? 255 : 0]))).toBe(true)
  })

  it('sinks all but the feet one pixel on the exhale frame', () => {
    const pixels = new Uint32Array(256)
    pixels[1 * 16 + 5] = 0xff0000ff
    pixels[14 * 16 + 5] = 0xff00ff00
    const out = exhaleSprite({ pixels, size: 16 })
    expect(out[1 * 16 + 5]).toBe(0)
    expect(out[2 * 16 + 5]).toBe(0xff0000ff)
    expect(out[14 * 16 + 5]).toBe(0xff00ff00)
    expect(pixels[1 * 16 + 5]).toBe(0xff0000ff)
  })

  it('sinks a 32x32 sprite two pixels and keeps its bottom six rows still', () => {
    const pixels = new Uint32Array(32 * 32)
    pixels[2 * 32 + 5] = 0xff0000ff
    pixels[27 * 32 + 5] = 0xff00ff00
    const out = exhaleSprite({ pixels, size: 32 })
    expect(out[2 * 32 + 5]).toBe(0)
    expect(out[4 * 32 + 5]).toBe(0xff0000ff)
    expect(out[27 * 32 + 5]).toBe(0xff00ff00)
  })

  it('gives different sprites different tags', () => {
    const a = encodeSprite(sprite(() => [1, 2, 3, 255]))!
    const b = encodeSprite(sprite(() => [1, 2, 4, 255]))!
    expect(spriteTag(a)).toBe(spriteTag(a))
    expect(spriteTag(a)).not.toBe(spriteTag(b))
  })
})
