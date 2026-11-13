import { describe, expect, it } from 'vitest'
import type { Quantized } from './quantize.ts'
import { composeLayer, findBands, findSprites } from './slice.ts'

function sheet(width: number, height: number, rects: Array<[number, number, number, number]>) {
  const data = new Uint8Array(width * height * 4)
  for (const [left, top, right, bottom] of rects) {
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) data.set([10, 20, 30, 255], (y * width + x) * 4)
    }
  }
  return { data, width, height }
}

describe('findSprites', () => {
  it('returns one box per object in reading order', () => {
    const image = sheet(100, 60, [
      [60, 5, 80, 25],
      [5, 8, 25, 28],
      [10, 40, 30, 55],
    ])
    expect(findSprites(image, { gap: 4, minArea: 10 })).toEqual([
      { left: 5, top: 8, right: 25, bottom: 28 },
      { left: 60, top: 5, right: 80, bottom: 25 },
      { left: 10, top: 40, right: 30, bottom: 55 },
    ])
  })

  it('merges parts closer than the gap and drops specks', () => {
    const image = sheet(100, 40, [
      [5, 5, 25, 30],
      [28, 10, 40, 20],
      [90, 35, 92, 37],
    ])
    expect(findSprites(image, { gap: 6, minArea: 10 })).toEqual([
      { left: 5, top: 5, right: 40, bottom: 30 },
    ])
  })
})

describe('composeLayer', () => {
  const tileImage: Quantized = { width: 3, height: 2, indices: Int16Array.from([0, 1, 2, 3, 4, 5]) }

  it('mirrors copies so seams match, and offsets vertically', () => {
    const out = composeLayer(tileImage, { width: 8, height: 3, tile: 'mirror', offsetY: 1 })
    expect([...out.indices.slice(0, 8)]).toEqual(Array(8).fill(-1))
    expect([...out.indices.slice(8, 16)]).toEqual([0, 1, 2, 2, 1, 0, 0, 1])
    expect([...out.indices.slice(16, 24)]).toEqual([3, 4, 5, 5, 4, 3, 3, 4])
  })

  it('pins the halves to the edges', () => {
    const out = composeLayer(tileImage, { width: 8, height: 2, tile: 'edges', offsetY: 0 })
    // Width 3 splits at 1.5: columns 0 and 1 pin left, column 2 pins right.
    expect([...out.indices.slice(0, 8)]).toEqual([0, 1, -1, -1, -1, -1, -1, 2])
  })

  it('fills downwards by reflecting about the last painted row', () => {
    const padded: Quantized = {
      width: 2,
      height: 5,
      indices: Int16Array.from([0, 1, 2, 3, 4, 5, -1, -1, -1, -1]),
    }
    const out = composeLayer(padded, {
      width: 2,
      height: 8,
      tile: 'none',
      offsetY: 1,
      mirrorDown: true,
    })
    expect([...out.indices]).toEqual([-1, -1, 0, 1, 2, 3, 4, 5, 4, 5, 2, 3, 0, 1, 0, 1])
  })
})

describe('anchoring and bands', () => {
  const padded: Quantized = {
    width: 2,
    height: 6,
    indices: Int16Array.from([-1, -1, 0, 1, 2, 3, 4, 5, -1, -1, -1, -1]),
  }

  it('aligns the painted top or bottom edge, ignoring blank rows', () => {
    const top = composeLayer(padded, {
      width: 2,
      height: 6,
      tile: 'none',
      anchor: { edge: 'top', y: 1 },
    })
    expect([...top.indices]).toEqual([-1, -1, 0, 1, 2, 3, 4, 5, -1, -1, -1, -1])
    const bottom = composeLayer(padded, {
      width: 2,
      height: 6,
      tile: 'none',
      anchor: { edge: 'bottom', y: 6 },
    })
    expect([...bottom.indices]).toEqual([-1, -1, -1, -1, -1, -1, 0, 1, 2, 3, 4, 5])
  })

  it('finds bands separated by clear rows', () => {
    const data = new Uint8Array(4 * 30 * 4)
    for (const y of [2, 3, 4, 20, 21, 27]) data[(y * 4 + 1) * 4 + 3] = 255
    expect(findBands({ data, width: 4, height: 30 }, 5)).toEqual([
      { top: 2, bottom: 5 },
      { top: 20, bottom: 22 },
      { top: 27, bottom: 28 },
    ])
  })
})
