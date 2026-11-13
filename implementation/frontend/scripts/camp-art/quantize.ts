// Turns generated or hand-edited source images into grid-exact, on-palette
// pixel art: find the pixel grid, take the most common palette colour in each
// cell, and key out the background.

import { labDistance, rgbToLab, type Lab } from '../../src/features/campaigns/camp/oklab.ts'

export type Rgba = { data: Uint8Array | Uint8ClampedArray; width: number; height: number }

const differs = (data: ArrayLike<number>, first: number, second: number) =>
  Math.abs(data[first] - data[second]) +
    Math.abs(data[first + 1] - data[second + 1]) +
    Math.abs(data[first + 2] - data[second + 2]) >
  30

/**
 * The size in source pixels of one art pixel. Colour changes in a gridded image
 * only ever happen on cell boundaries, so the largest cell size that explains
 * (nearly) every change is the grid. Flat or ungridded images return 1.
 */
export function detectGridSize({ data, width, height }: Rgba, maxCell = 16) {
  const changesAt = (axis: 'x' | 'y') => {
    const counts = new Array<number>(axis === 'x' ? width : height).fill(0)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const here = (y * width + x) * 4
        if (axis === 'x' && x > 0 && differs(data, here, here - 4)) counts[x] += 1
        if (axis === 'y' && y > 0 && differs(data, here, here - width * 4)) counts[y] += 1
      }
    }
    return counts
  }
  const horizontal = changesAt('x')
  const vertical = changesAt('y')
  const total = horizontal.reduce((a, b) => a + b, 0) + vertical.reduce((a, b) => a + b, 0)
  if (total === 0) return 1
  for (let cell = maxCell; cell >= 2; cell -= 1) {
    let aligned = 0
    for (let index = 0; index < horizontal.length; index += cell) aligned += horizontal[index]
    for (let index = 0; index < vertical.length; index += cell) aligned += vertical[index]
    if (aligned / total >= 0.97) return cell
  }
  return 1
}

export type QuantizeOptions = {
  /** Allowed colours as [r, g, b]. */
  palette: ReadonlyArray<readonly [number, number, number]>
  /** Source pixels per art pixel. */
  cell: number
  /** Background colour to treat as transparent, with a tolerance in RGB sum. */
  key?: readonly [number, number, number]
  keyTolerance?: number
}

export type Quantized = {
  width: number
  height: number
  /** Index into `palette`, or -1 for a transparent pixel. */
  indices: Int16Array
}

export function quantizeToGrid(
  { data, width, height }: Rgba,
  { palette, cell, key, keyTolerance = 40 }: QuantizeOptions,
): Quantized {
  const labs: Lab[] = palette.map(([r, g, b]) => rgbToLab([r, g, b]))
  const nearestCache = new Map<number, number>()
  const nearest = (r: number, g: number, b: number) => {
    const packed = (r << 16) | (g << 8) | b
    const cached = nearestCache.get(packed)
    if (cached !== undefined) return cached
    const lab = rgbToLab([r, g, b])
    let best = 0
    let bestDistance = Infinity
    labs.forEach((candidate, index) => {
      const distance = labDistance(lab, candidate)
      if (distance < bestDistance) {
        best = index
        bestDistance = distance
      }
    })
    nearestCache.set(packed, best)
    return best
  }

  const outWidth = Math.floor(width / cell)
  const outHeight = Math.floor(height / cell)
  const indices = new Int16Array(outWidth * outHeight)
  const tally = new Map<number, number>()
  for (let cy = 0; cy < outHeight; cy += 1) {
    for (let cx = 0; cx < outWidth; cx += 1) {
      tally.clear()
      let opaque = 0
      for (let y = cy * cell; y < (cy + 1) * cell; y += 1) {
        for (let x = cx * cell; x < (cx + 1) * cell; x += 1) {
          const at = (y * width + x) * 4
          if (data[at + 3] < 128) continue
          if (
            key &&
            Math.abs(data[at] - key[0]) +
              Math.abs(data[at + 1] - key[1]) +
              Math.abs(data[at + 2] - key[2]) <=
              keyTolerance
          ) {
            continue
          }
          opaque += 1
          const index = nearest(data[at], data[at + 1], data[at + 2])
          tally.set(index, (tally.get(index) ?? 0) + 1)
        }
      }
      let winner = -1
      let winnerCount = 0
      for (const [index, count] of tally) {
        if (count > winnerCount || (count === winnerCount && index < winner)) {
          winner = index
          winnerCount = count
        }
      }
      indices[cy * outWidth + cx] = opaque * 2 >= cell * cell ? winner : -1
    }
  }
  return { width: outWidth, height: outHeight, indices }
}

/** Compacts a quantized image to the colours it uses, clear colour first. */
export function toIndexedImage(
  { width, height, indices }: Quantized,
  palette: ReadonlyArray<readonly [number, number, number]>,
) {
  const used = [...new Set(indices)].filter((index) => index >= 0).sort((a, b) => a - b)
  const transparent = indices.some((index) => index < 0)
  const entries: Array<readonly [number, number, number]> = transparent ? [[0, 0, 0]] : []
  const remap = new Map<number, number>()
  for (const index of used) {
    remap.set(index, entries.length)
    entries.push(palette[index])
  }
  const out = new Uint8Array(indices.length)
  indices.forEach((index, position) => {
    out[position] = index < 0 ? 0 : remap.get(index)!
  })
  return { width, height, palette: entries, indices: out, transparent }
}
