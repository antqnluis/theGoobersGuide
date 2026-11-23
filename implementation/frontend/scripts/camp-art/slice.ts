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
  /** Row of the canvas where the image's first row lands. Ignored when `anchor` is set. */
  offsetY?: number
  /**
   * Aligns the painted content instead: its top (or bottom) edge lands on row
   * `y`, whatever blank rows the source has around it.
   */
  anchor?: { edge: 'top' | 'bottom'; y: number }
  /** Repeat the image downwards, flipped, to fill the canvas. */
  mirrorDown?: boolean
  /**
   * With `mirrorDown`: painted rows at the bottom to leave out before reflecting,
   * for a source whose lower edge is darkened or dashed and would show as a seam.
   */
  mirrorTrim?: number
  /**
   * With `mirrorDown`: shifts the reflected copies sideways by this many pixels,
   * so props are not mirrored into obvious pairs across the axis.
   */
  mirrorShift?: number
  /**
   * Fills below each painted column down to this row (exclusive) with the layer's
   * most common bottom-edge colour, so a distant ridge never leaves sky showing
   * below it where the nearer layers are sparse.
   */
  fillDownTo?: number
}

const bounce = (value: number, size: number) => {
  const period = size * 2
  const wrapped = ((value % period) + period) % period
  return wrapped < size ? wrapped : period - 1 - wrapped
}

export function composeLayer(image: Quantized, placement: LayerPlacement): Quantized {
  const {
    width,
    height,
    tile,
    anchor,
    mirrorDown = false,
    mirrorTrim = 0,
    mirrorShift = 0,
  } = placement
  const indices = new Int16Array(width * height).fill(-1)

  const rowIsClear = (row: number) =>
    image.indices.subarray(row * image.width, (row + 1) * image.width).every((index) => index < 0)
  let firstRow = 0
  let lastRow = image.height - 1
  while (firstRow < image.height && rowIsClear(firstRow)) firstRow += 1
  while (lastRow > firstRow && rowIsClear(lastRow)) lastRow -= 1
  if (mirrorDown) lastRow = Math.max(firstRow, lastRow - mirrorTrim)

  // Mirroring downwards reflects about the last painted row, not the image edge.
  const offsetY = anchor
    ? anchor.edge === 'top'
      ? anchor.y - firstRow
      : anchor.y - (lastRow + 1)
    : (placement.offsetY ?? 0)

  for (let y = 0; y < height; y += 1) {
    const sourceRow = y - offsetY
    let row = sourceRow
    let shift = 0
    if (mirrorDown) {
      if (sourceRow < firstRow) continue
      const size = lastRow - firstRow + 1
      row = firstRow + bounce(sourceRow - firstRow, size)
      if (sourceRow - firstRow >= size) shift = mirrorShift
    }
    if (row < 0 || row >= image.height) continue
    for (let x = 0; x < width; x += 1) {
      let column: number
      if (tile === 'mirror') column = bounce(x + shift, image.width)
      else if (tile === 'edges') {
        const half = image.width / 2
        if (x < width / 2) column = x < half ? x : -1
        else column = x >= width - half ? x - (width - image.width) : -1
      } else column = x
      if (column < 0 || column >= image.width) continue
      indices[y * width + x] = image.indices[row * image.width + column]
    }
  }
  if (placement.fillDownTo) {
    // One flat colour (the most common among the columns' lowest painted pixels),
    // so ragged edges and dithering never streak down the fill.
    const lowest: number[] = []
    const lastRows: number[] = []
    for (let x = 0; x < width; x += 1) {
      let last = height - 1
      while (last >= 0 && indices[last * width + x] < 0) last -= 1
      lastRows.push(last)
      if (last >= 0) lowest.push(indices[last * width + x])
    }
    const counts = new Map<number, number>()
    for (const index of lowest) counts.set(index, (counts.get(index) ?? 0) + 1)
    const [flat] = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0] ?? [-1]
    if (flat >= 0) {
      for (let x = 0; x < width; x += 1) {
        if (lastRows[x] < 0) continue
        for (let y = lastRows[x] + 1; y < Math.min(height, placement.fillDownTo); y += 1) {
          indices[y * width + x] = flat
        }
      }
    }
  }
  return { width, height, indices }
}

/**
 * Row ranges of the separate horizontal bands on a keyed image: runs of rows
 * holding any painted pixel, split wherever at least `gap` rows are clear.
 */
export function findBands(
  { data, width, height }: { data: Uint8Array | Uint8ClampedArray; width: number; height: number },
  gap = 20,
) {
  const bands: Array<{ top: number; bottom: number }> = []
  let clearRun = gap
  for (let y = 0; y < height; y += 1) {
    let painted = false
    for (let x = 0; x < width && !painted; x += 1) painted = data[(y * width + x) * 4 + 3] >= 128
    if (painted) {
      if (clearRun >= gap) bands.push({ top: y, bottom: y + 1 })
      else bands[bands.length - 1].bottom = y + 1
      clearRun = 0
    } else clearRun += 1
  }
  return bands
}
