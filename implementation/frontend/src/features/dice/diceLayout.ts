/**
 * Where the dice tray sits, how big it is, and whether it is pinned open. The Dice button never
 * moves; the tray floats free of it. A position is the tray's distance from the bottom-right of
 * the screen, and resizing grows it up and to the left. This is a per-device preference kept in
 * the browser; nothing about it is saved to the server.
 */

export type DicePosition = { right: number; bottom: number }
export type DiceSize = { width: number; height: number }
export type DiceLayout = {
  /** Keeps the tray open: it comes back after a reload and Escape does not close it. */
  pinned: boolean
  /** Null until the tray has been moved; then it sits above the Dice button. */
  position: DicePosition | null
  /** Null until the tray has been resized; then the default size is used. */
  size: DiceSize | null
}
export type Box = { width: number; height: number }

export const defaultLayout: DiceLayout = { pinned: false, position: null, size: null }
export const minTraySize: DiceSize = { width: 300, height: 320 }
/** Below this viewport width the tray is a bottom sheet and cannot be arranged. */
export const arrangeMinWidth = 640

const storageKey = 'goobers-guide.dice-layout.v1'

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

/** Keeps the whole tray on the screen. */
export function clampPosition(position: DicePosition, bounds: Box, tray: Box): DicePosition {
  return {
    right: Math.round(clamp(position.right, 0, bounds.width - tray.width)),
    bottom: Math.round(clamp(position.bottom, 0, bounds.height - tray.height)),
  }
}

/** Keeps the tray at least a usable size and on the screen, growing up and left from `anchor`. */
export function clampSize(size: DiceSize, bounds: Box, anchor: DicePosition): DiceSize {
  return {
    width: Math.round(clamp(size.width, minTraySize.width, bounds.width - anchor.right)),
    height: Math.round(clamp(size.height, minTraySize.height, bounds.height - anchor.bottom)),
  }
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

/** Reads a stored layout, ignoring anything that is not shaped like one. */
export function parseLayout(raw: unknown): DiceLayout {
  if (typeof raw !== 'object' || raw === null) return defaultLayout
  const value = raw as Record<string, unknown>
  const position = value.position as Record<string, unknown> | null | undefined
  const size = value.size as Record<string, unknown> | null | undefined
  return {
    pinned: value.pinned === true,
    position:
      position && isCount(position.right) && isCount(position.bottom)
        ? { right: position.right, bottom: position.bottom }
        : null,
    size:
      size && isCount(size.width) && isCount(size.height)
        ? {
            width: Math.max(size.width, minTraySize.width),
            height: Math.max(size.height, minTraySize.height),
          }
        : null,
  }
}

export function loadLayout(): DiceLayout {
  try {
    const raw = window.localStorage.getItem(storageKey)
    return raw ? parseLayout(JSON.parse(raw)) : defaultLayout
  } catch {
    return defaultLayout
  }
}

export function saveLayout(layout: DiceLayout) {
  try {
    if (!layout.pinned && !layout.position && !layout.size) {
      window.localStorage.removeItem(storageKey)
    } else {
      window.localStorage.setItem(storageKey, JSON.stringify(layout))
    }
  } catch {
    // Storage can be blocked or full; the arrangement then lasts until the page closes.
  }
}

export function isArranged(layout: DiceLayout) {
  return Boolean(layout.position || layout.size)
}
