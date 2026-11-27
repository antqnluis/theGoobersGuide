// Turns a camera view into a flat list of drawImage operations. Pure, so the
// renderer only has to execute it and tests can check every pixel position.

import { landscapeIds, sceneProps } from './campArt'
import { layerOffset, layerOrigin, parallax, projectToDevice, type View } from './campProjection'
import { panorama, shrineStone, shrineStoneLit } from './campLayout'
import { figureSize, frameSpriteId, type PartyFigure } from './campParty'
import type { CampKind } from './campPalette'

export type DrawOp = {
  id: string
  sx: number
  sy: number
  sw: number
  sh: number
  dx: number
  dy: number
  dw: number
  dh: number
  flipX?: boolean
  flipY?: boolean
}

export type ImageSizes = Record<string, { width: number; height: number }>

const intersects = (op: DrawOp, view: View) =>
  op.dx < view.deviceWidth && op.dx + op.dw > 0 && op.dy < view.deviceHeight && op.dy + op.dh > 0

/**
 * The star-rich top of the sky repeats upwards, flipped on alternate copies so
 * the seams match. The sky's lower rows, which fade to dark behind the hills,
 * are left out of the repeat.
 */
const skyRepeatRows = 170

/**
 * A full-width layer repeated left and right, flipping every other copy so the
 * seams match. With `repeatUp`, the layer's top rows also fill any space above
 * the panorama.
 */
function tiledLayer(id: string, factor: number, view: View, repeatUp: number | false): DrawOp[] {
  const { scale } = view
  const origin = layerOrigin(view, factor)
  const width = panorama.width * scale
  const offset = layerOffset(view.cameraX, factor) * scale
  const first = Math.floor(offset / width)
  const last = Math.floor((offset + view.deviceWidth) / width)
  const ops: DrawOp[] = []

  const row = (sh: number, dy: number, flipY: boolean) => {
    for (let column = first; column <= last; column += 1) {
      const op: DrawOp = {
        id,
        sx: 0,
        sy: 0,
        sw: panorama.width,
        sh,
        dx: column * width - offset,
        dy,
        dw: width,
        dh: sh * scale,
        flipX: Math.abs(column) % 2 === 1,
        flipY,
      }
      if (intersects(op, view)) ops.push(op)
    }
  }

  row(panorama.height, origin.y, false)
  if (repeatUp) {
    const band = repeatUp * scale
    for (let copy = 1; origin.y - (copy - 1) * band > 0; copy += 1) {
      row(repeatUp, origin.y - copy * band, copy % 2 === 1)
    }
  }
  return ops
}

/**
 * The foreground trees are cut in two: the canopy (rows above `foregroundSplit`)
 * and the trunk and roots below it. The trunk rows between the two are a plain
 * stretch of bark (`foregroundBand`), so on a view taller than the panorama the
 * canopy rides at the top of the screen and that bark repeats down to the
 * trunk, and the trees reach the top instead of ending in mid-air.
 */
export const foregroundSplit = 49
export const foregroundBand = 5

/** Frames pinned to the left and right edges of the view, not the panorama. */
function pinnedForeground(view: View): DrawOp[] {
  const { scale } = view
  const origin = layerOrigin(view, parallax.foreground)
  const half = panorama.width / 2
  const dw = half * scale
  const trunkTop = origin.y + foregroundSplit * scale
  const bandHeight = foregroundBand * scale
  const ops: DrawOp[] = []
  for (const [sx, dx] of [
    [0, 0],
    [half, view.deviceWidth - dw],
  ]) {
    const base = { id: 'foreground', sx, sw: half, dx, dw }
    // Bark fills the gap between the canopy at the top of the screen and the
    // trunk, repeated upwards from the trunk and flipped each time so the seams
    // match; the copy against the trunk is flipped so it joins the bark exactly.
    const canopyBottom = foregroundSplit * scale
    for (let copy = 0; trunkTop - copy * bandHeight > canopyBottom; copy += 1) {
      ops.push({
        ...base,
        sy: foregroundSplit,
        sh: foregroundBand,
        dy: trunkTop - (copy + 1) * bandHeight,
        dh: bandHeight,
        flipY: copy % 2 === 0,
      })
    }
    ops.push({
      ...base,
      sy: foregroundSplit,
      sh: panorama.height - foregroundSplit,
      dy: trunkTop,
      dh: (panorama.height - foregroundSplit) * scale,
    })
    ops.push({ ...base, sy: 0, sh: foregroundSplit, dy: 0, dh: canopyBottom })
  }
  return ops
}

export function planScene(
  view: View,
  kind: CampKind,
  sizes: ImageSizes,
  figures: readonly PartyFigure[] = [],
  /** Which breathing frame the party is on; members alternate by their own phase. */
  bobFrame = 0,
  /** The shrine stone glows: its lit sprite stands where the idle one would. */
  shrineLit = false,
): DrawOp[] {
  const { ridge, mid, ground } = landscapeIds(kind)
  const ops: DrawOp[] = [
    ...tiledLayer('sky', parallax.sky, view, skyRepeatRows),
    ...tiledLayer(ridge, parallax.ridge, view, false),
    ...tiledLayer(mid, parallax.trees, view, false),
    ...tiledLayer(ground, parallax.ground, view, false),
  ]
  // Props and seated figures share one back-to-front order. The sort is stable
  // and props come first, so a figure on a bedroll draws after it.
  const standing: Array<{ depth: number; op: DrawOp }> = []
  const stand = (
    id: string,
    point: { x: number; y: number },
    size: { width: number; height: number },
    depth: number,
    flipX?: boolean,
    /** Enlarges the sprite, to whole art pixels so it still sits on the pixel grid. */
    enlarge = 1,
  ) => {
    const foot = projectToDevice(point, view)
    const width = Math.round(size.width * enlarge)
    const height = Math.round(size.height * enlarge)
    const op: DrawOp = {
      id,
      sx: 0,
      sy: 0,
      sw: size.width,
      sh: size.height,
      dx: foot.x - Math.floor(width / 2) * view.scale,
      dy: foot.y - height * view.scale,
      dw: width * view.scale,
      dh: height * view.scale,
      flipX,
    }
    if (intersects(op, view)) standing.push({ depth, op })
  }
  for (const prop of sceneProps) {
    const id = shrineLit && prop.id === shrineStone.id ? shrineStoneLit : prop.id
    const size = sizes[id] ?? sizes[prop.id]
    if (size) stand(sizes[id] ? id : prop.id, prop, size, prop.y, prop.flip, prop.scale)
  }
  for (const figure of figures) {
    const id = frameSpriteId(figure.spriteId, (bobFrame + figure.phase) % 2)
    // A custom sprite may be drawn from more pixels than it stands tall in the camp.
    const source = sizes[id] ?? figureSize
    stand(id, figure, source, figure.depth, figure.flip, figure.size / source.width)
  }
  ops.push(...standing.toSorted((a, b) => a.depth - b.depth).map(({ op }) => op))
  ops.push(...pinnedForeground(view))
  return ops
}
