import { clamp, type SceneBounds } from './orreryCamera'

export const labelGap = 6

export type Box = { left: number; top: number; right: number; bottom: number }

export type LabelAnchor = {
  id: string
  /** Projected center of the world, in canvas pixels. */
  x: number
  y: number
  /** Pixel radius the label has to clear. */
  extent: number
  width: number
  height: number
  /** A pinned label sits above its world whatever else is nearby. */
  pinned?: boolean
}

export type LabelPlacement = { id: string; left: number; top: number }

function overlaps(a: Box, b: Box) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

/**
 * Places labels in the order given, which is their priority. A label goes
 * above its world, or below when that is taken, and stays inside the clear
 * part of the scene. One that would cover another world, an earlier label, or
 * an obstacle is left out.
 */
export function placeLabels(
  anchors: readonly LabelAnchor[],
  bounds: SceneBounds,
  obstacles: readonly Box[] = [],
): LabelPlacement[] {
  const right = bounds.left + bounds.width
  const bottom = bounds.top + bounds.height
  const worlds = anchors.map(({ x, y, extent }) => ({
    left: x - extent,
    right: x + extent,
    top: y - extent,
    bottom: y + extent,
  }))
  const taken = [...obstacles]
  const placements: LabelPlacement[] = []

  anchors.forEach(({ id, x, y, extent, width, height, pinned }, index) => {
    if (width <= 0 || width > bounds.width) return
    if (x < bounds.left || x > right || y < bounds.top || y > bottom) return
    const left = clamp(x - width / 2, bounds.left, right - width)
    const above = y - extent - labelGap - height
    for (const top of pinned ? [above] : [above, y + extent + labelGap]) {
      const box = { left, top, right: left + width, bottom: top + height }
      if (box.top < bounds.top || box.bottom > bottom) continue
      if (
        !pinned &&
        (taken.some((other) => overlaps(box, other)) ||
          worlds.some((world, other) => other !== index && overlaps(box, world)))
      )
        continue
      placements.push({ id, left, top })
      taken.push(box)
      return
    }
  })
  return placements
}
