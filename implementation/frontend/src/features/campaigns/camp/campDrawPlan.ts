// Turns a camera view into a flat list of drawImage operations. Pure, so the
// renderer only has to execute it and tests can check every pixel position.

import { landscapeIds, sceneProps } from './campArt'
import { layerOffset, panoramaOrigin, parallax, projectToDevice, type View } from './campProjection'
import { panorama } from './campLayout'
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
  const origin = panoramaOrigin(view)
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

/** Frames pinned to the left and right edges of the view, not the panorama. */
function pinnedForeground(view: View): DrawOp[] {
  const origin = panoramaOrigin(view)
  const half = panorama.width / 2
  const dw = half * view.scale
  const common = { id: 'foreground', sy: 0, sw: half, sh: panorama.height, dy: origin.y, dw }
  const dh = panorama.height * view.scale
  return [
    { ...common, sx: 0, dx: 0, dh },
    { ...common, sx: half, dx: view.deviceWidth - dw, dh },
  ]
}

export function planScene(view: View, kind: CampKind, sizes: ImageSizes): DrawOp[] {
  const { ridge, mid, ground } = landscapeIds(kind)
  const ops: DrawOp[] = [
    ...tiledLayer('sky', parallax.sky, view, skyRepeatRows),
    ...tiledLayer(ridge, parallax.ridge, view, false),
    ...tiledLayer(mid, parallax.trees, view, false),
    ...tiledLayer(ground, parallax.ground, view, false),
  ]
  for (const prop of sceneProps) {
    const size = sizes[prop.id]
    if (!size) continue
    const foot = projectToDevice(prop, view)
    const op: DrawOp = {
      id: prop.id,
      sx: 0,
      sy: 0,
      sw: size.width,
      sh: size.height,
      dx: foot.x - Math.floor(size.width / 2) * view.scale,
      dy: foot.y - size.height * view.scale,
      dw: size.width * view.scale,
      dh: size.height * view.scale,
      flipX: prop.flip,
    }
    if (intersects(op, view)) ops.push(op)
  }
  ops.push(...pinnedForeground(view))
  return ops
}
