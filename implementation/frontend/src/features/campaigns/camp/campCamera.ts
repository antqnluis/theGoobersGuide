// Camera maths for the camp panorama. Everything is pure and works in whole
// pixels: the camera x is the panorama column at the left edge of the view, in
// base art pixels, and is always an integer so motion snaps to the pixel grid.

import { panorama, restFocusX } from './campLayout.ts'

/**
 * The integer scale from base art pixels to device pixels. The panorama fills
 * the view's height as closely as a whole multiple allows, capped so a narrow
 * view still shows `minVisibleWidth` base pixels; leftover height is filled
 * with sky above the ground.
 */
export function pixelScale(deviceHeight: number, deviceWidth = Infinity) {
  const byHeight = Math.floor(deviceHeight / panorama.height)
  const byWidth = Math.floor(deviceWidth / minVisibleWidth)
  return Math.max(1, Math.min(byHeight, byWidth))
}

/** The scale never zooms in past showing this many base pixels across. */
export const minVisibleWidth = 280

/** The camera x of the resting view, centred between the three destinations. */
export function restCameraX(visible: number) {
  return cameraToPlace(restFocusX, visible)
}

/** How many base pixels of the panorama the view shows across. */
export function visibleWidth(deviceWidth: number, scale: number) {
  return deviceWidth / scale
}

/**
 * Keeps the view inside the panorama. When the view is wider than the
 * panorama it centres, and the edges are filled with sky and ground.
 */
export function clampCameraX(x: number, visible: number) {
  if (visible >= panorama.width) return Math.round((panorama.width - visible) / 2)
  return Math.round(Math.min(panorama.width - visible, Math.max(0, x)))
}

/** The camera x that puts a panorama column at a fraction of the view width. */
export function cameraToPlace(worldX: number, visible: number, screenFraction = 0.5) {
  return clampCameraX(worldX - visible * screenFraction, visible)
}

export type PanelSide = 'left' | 'right'

/** The side a panel docks on: opposite the place it describes. */
export function panelSideForWorldX(worldX: number): PanelSide {
  return worldX > panorama.width / 2 ? 'left' : 'right'
}

/**
 * Frames a place in the part of the view the docked panel leaves open, which
 * is about the opposite third on desktop. Returns null for a full-screen sheet,
 * where the camera stays put.
 */
export function cameraToFrame({
  worldX,
  visible,
  panelFraction,
  panelSide = panelSideForWorldX(worldX),
}: {
  worldX: number
  visible: number
  /** Share of the view width the panel covers, 0 to 1. */
  panelFraction: number
  panelSide?: PanelSide
}) {
  if (panelFraction >= 1) return null
  const open = 1 - panelFraction
  const screenFraction = panelSide === 'right' ? open / 2 : panelFraction + open / 2
  return cameraToPlace(worldX, visible, screenFraction)
}

export function easeInOutCubic(t: number) {
  const clamped = Math.min(1, Math.max(0, t))
  return clamped < 0.5 ? 4 * clamped ** 3 : 1 - (-2 * clamped + 2) ** 3 / 2
}

export type Pan = { from: number; to: number; start: number; duration: number }

export function startPan(from: number, to: number, now: number, duration: number): Pan {
  return { from, to, start: now, duration }
}

/** The pixel-snapped camera x of a pan at a given time. */
export function panPosition(pan: Pan, now: number) {
  if (pan.duration <= 0 || now >= pan.start + pan.duration) return pan.to
  const eased = easeInOutCubic((now - pan.start) / pan.duration)
  return Math.round(pan.from + (pan.to - pan.from) * eased)
}

export function panFinished(pan: Pan, now: number) {
  return pan.duration <= 0 || now >= pan.start + pan.duration
}

/**
 * Retargeting never queues: the new pan starts from wherever the camera is
 * right now, so rapid clicks only ever change the destination.
 */
export function retarget(pan: Pan, to: number, now: number, duration: number): Pan {
  return startPan(panPosition(pan, now), to, now, duration)
}

/**
 * Landfall: how far above its resting height the camera starts, in base
 * pixels, `extent` being the sky it looks up through. Eases to zero.
 */
export function descentOffset(progress: number, extent: number) {
  return Math.round(extent * (1 - easeInOutCubic(progress)))
}
