// Maps panorama positions to screen positions. The renderer draws with it and
// the DOM buttons are placed with it, so a button always sits on its object.

import { panorama } from './campLayout'

/** Parallax factor per layer: 0 is fixed to the screen, 1 moves with the camera. */
export const parallax = {
  sky: 0.1,
  ridge: 0.3,
  trees: 0.6,
  ground: 1,
} as const

export type View = {
  /** Camera x in base art pixels. */
  cameraX: number
  /** Camera height above rest in base pixels, used by the landfall descent. */
  cameraY?: number
  /** Whole-number scale from base pixels to device pixels. */
  scale: number
  deviceWidth: number
  deviceHeight: number
}

/** Device-pixel origin of the panorama: bottom anchored, centred when wider. */
export function panoramaOrigin({ cameraX, cameraY = 0, scale, deviceWidth, deviceHeight }: View) {
  return {
    x: Math.round(-cameraX * scale),
    y: Math.round(deviceHeight - panorama.height * scale + cameraY * scale),
    extendsHorizontally: panorama.width * scale < deviceWidth,
  }
}

/** Horizontal offset of a layer, in whole base pixels. */
export function layerOffset(cameraX: number, factor: number) {
  return Math.round(cameraX * factor)
}

/** A panorama position on the ground layer, in device pixels. */
export function projectToDevice(point: { x: number; y: number }, view: View) {
  const origin = panoramaOrigin(view)
  return { x: origin.x + point.x * view.scale, y: origin.y + point.y * view.scale }
}

export type CssRect = { left: number; top: number; width: number; height: number }

/** The CSS-pixel box for a button centred on a panorama position. */
export function buttonRect(
  point: { x: number; y: number },
  view: View,
  dpr: number,
  size: { width: number; height: number },
): CssRect {
  const device = projectToDevice(point, view)
  const centreX = device.x / dpr
  const centreY = device.y / dpr
  return {
    left: Math.round(centreX - size.width / 2),
    top: Math.round(centreY - size.height / 2),
    width: size.width,
    height: size.height,
  }
}

/** Whether a rect lies wholly inside a CSS viewport; off-frame buttons are hidden. */
export function isInFrame(rect: CssRect, viewport: { width: number; height: number }) {
  return (
    rect.left >= 0 &&
    rect.top >= 0 &&
    rect.left + rect.width <= viewport.width &&
    rect.top + rect.height <= viewport.height
  )
}
