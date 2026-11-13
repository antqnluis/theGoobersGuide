// Finds the separate objects on a keyed sprite sheet and composes full-width
// parallax layers, working on palette-index images (-1 is transparent).

import type { Quantized } from './quantize.ts'

export type Box = { left: number; top: number; right: number; bottom: number }

/** Bounding boxes of connected opaque regions, merged when closer than `gap`. */
export function findSprites(
  { data, width, height }: { data: Uint8Array | Uint8ClampedArray; width: number; height: number },
  { gap = 24, minArea = 64 }: { gap?: number; minArea?: number } = {},
): Box[] {
  const seen = new Uint8Array(width * height)
  const opaque = (index: number) => data[index * 4 + 3] >= 128
  const boxes: Array<Box & { area: number }> = []
  const stack: number[] = []
  for (let start = 0; start < width * height; start += 1) {
    if (seen[start] || !opaque(start)) continue
    const box = { left: width, top: height, right: 0, bottom: 0, area: 0 }
    stack.push(start)
    seen[start] = 1
    while (stack.length) {
      const index = stack.pop()!
      const x = index % width
      const y = (index - x) / width
      box.left = Math.min(box.left, x)
      box.right = Math.max(box.right, x + 1)
      box.top = Math.min(box.top, y)
      box.bottom = Math.max(box.bottom, y + 1)
      box.area += 1
      for (const next of [index - 1, index + 1, index - width, index + width]) {
        if (next < 0 || next >= width * height || seen[next]) continue
        if ((next === index - 1 && x === 0) || (next === index + 1 && x === width - 1)) continue
        if (!opaque(next)) continue
        seen[next] = 1
        stack.push(next)
      }
    }
    if (box.area >= minArea) boxes.push(box)
  }
  const near = (a: Box, b: Box) =>
    a.left - gap <= b.right &&
    b.left - gap <= a.right &&
    a.top - gap <= b.bottom &&
    b.top - gap <= a.bottom
  let merged: Box[] = boxes
  for (let changed = true; changed;) {
    changed = false
    const next: Box[] = []
    for (const box of merged) {
      const target = next.find((other) => near(other, box))
      if (target) {
        target.left = Math.min(target.left, box.left)
        target.top = Math.min(target.top, box.top)
        target.right = Math.max(target.right, box.right)
        target.bottom = Math.max(target.bottom, box.bottom)
        changed = true
      } else {
        next.push({ left: box.left, top: box.top, right: box.right, bottom: box.bottom })
      }
    }
    merged = next
  }
  return sortReadingOrder(merged)
}

/** Rows first (boxes whose tops are within half a box height share a row), then left to right. */
export function sortReadingOrder(boxes: Box[]): Box[] {
  const rows: Box[][] = []
  for (const box of boxes.toSorted((a, b) => a.top - b.top)) {
    const row = rows.find(
      ([first]) => Math.abs(first.top - box.top) < (first.bottom - first.top) / 2,
    )
    if (row) row.push(box)
    else rows.push([box])
  }
  return rows.flatMap((row) => row.toSorted((a, b) => a.left - b.left))
}

export type LayerPlacement = {
  width: number
  height: number
  /**
   * `mirror` repeats the image across the width, flipping every other copy so
   * seams always match. `edges` pins the left half to the left edge and the
   * right half to the right edge. `none` places it once at the left.
   */
  tile: 'mirror' | 'edges' | 'none'
  /** Row of the canvas where the image's first row lands. */
  offsetY: number
  /** Repeat the image downwards, flipped, to fill the canvas. */
  mirrorDown?: boolean
}

const bounce = (value: number, size: number) => {
  const period = size * 2
  const wrapped = ((value % period) + period) % period
  return wrapped < size ? wrapped : period - 1 - wrapped
}

export function composeLayer(image: Quantized, placement: LayerPlacement): Quantized {
  const { width, height, tile, offsetY, mirrorDown = false } = placement
  const indices = new Int16Array(width * height).fill(-1)

  // Mirroring downwards reflects about the last painted row, not the image edge.
  let firstRow = 0
  let lastRow = image.height - 1
  if (mirrorDown) {
    const rowIsClear = (row: number) =>
      image.indices.subarray(row * image.width, (row + 1) * image.width).every((index) => index < 0)
    while (firstRow < image.height && rowIsClear(firstRow)) firstRow += 1
    while (lastRow > firstRow && rowIsClear(lastRow)) lastRow -= 1
  }

  for (let y = 0; y < height; y += 1) {
    const sourceRow = y - offsetY
    let row = sourceRow
    if (mirrorDown) {
      if (sourceRow < firstRow) continue
      row = firstRow + bounce(sourceRow - firstRow, lastRow - firstRow + 1)
    }
    if (row < 0 || row >= image.height) continue
    for (let x = 0; x < width; x += 1) {
      let column: number
      if (tile === 'mirror') column = bounce(x, image.width)
      else if (tile === 'edges') {
        const half = image.width / 2
        if (x < width / 2) column = x < half ? x : -1
        else column = x >= width - half ? x - (width - image.width) : -1
      } else column = x
      if (column < 0 || column >= image.width) continue
      indices[y * width + x] = image.indices[row * image.width + column]
    }
  }
  return { width, height, indices }
}
