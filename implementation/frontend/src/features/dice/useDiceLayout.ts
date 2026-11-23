import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import {
  arrangeMinWidth,
  clampPosition,
  clampSize,
  isArranged,
  loadLayout,
  saveLayout,
  type Box,
  type DiceLayout,
  type DicePosition,
  type DiceSize,
} from './diceLayout'

const nudge = 16
const bigNudge = 64

/** Where the tray is on the screen, and how big the screen is. */
function measure(tray: HTMLElement) {
  const rect = tray.getBoundingClientRect()
  const bounds: Box = {
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
  }
  const position: DicePosition = {
    right: bounds.width - rect.right,
    bottom: bounds.height - rect.bottom,
  }
  return { bounds, position, size: { width: rect.width, height: rect.height } }
}

/** Follows a pointer from `event` until it lifts, reporting how far it has moved. */
function track(
  event: PointerEvent,
  onMove: (dx: number, dy: number) => void,
  onEnd: () => void,
): () => void {
  const startX = event.clientX
  const startY = event.clientY
  const move = (next: globalThis.PointerEvent) =>
    onMove(next.clientX - startX, next.clientY - startY)
  const stop = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', stop)
    window.removeEventListener('pointercancel', stop)
    onEnd()
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', stop)
  window.addEventListener('pointercancel', stop)
  return stop
}

function useArrangeable() {
  const query = `(min-width: ${arrangeMinWidth}px)`
  const [arrangeable, setArrangeable] = useState(
    () => typeof window.matchMedia !== 'function' || window.matchMedia(query).matches,
  )
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const list = window.matchMedia(query)
    // Older engines and test doubles offer only the deprecated listener methods, or none.
    if (typeof list.addEventListener !== 'function') return
    const onChange = () => setArrangeable(list.matches)
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }, [query])
  return arrangeable
}

const moveSteps: Record<string, [number, number]> = {
  ArrowLeft: [1, 0],
  ArrowRight: [-1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
}

/**
 * Pin, move, and resize the dice tray. The Dice button stays in its corner; only the tray floats,
 * and it can go anywhere on the screen. Wide screens only: on a phone the tray is a bottom sheet,
 * so `arrangeable` is false and no inline styles are applied. The arrangement is kept in this
 * browser (see `diceLayout.ts`).
 */
export function useDiceLayout(watch: { open: boolean; host: HTMLElement | null }) {
  const trayRef = useRef<HTMLElement>(null)
  const arrangeable = useArrangeable()
  const [layout, setLayout] = useState<DiceLayout>(loadLayout)
  const [dragging, setDragging] = useState(false)
  const layoutRef = useRef(layout)
  const stopTracking = useRef<(() => void) | null>(null)

  useEffect(() => {
    layoutRef.current = layout
    saveLayout(layout)
  }, [layout])

  useEffect(() => () => stopTracking.current?.(), [])

  const place = useCallback(
    (wanted: DicePosition) => {
      const tray = trayRef.current
      if (!tray) return
      const { bounds, size } = measure(tray)
      if (bounds.width === 0) return
      const position = clampPosition(wanted, bounds, size)
      setLayout((current) => ({ ...current, position }))
    },
    [trayRef],
  )

  const resizeTo = useCallback(
    (wanted: DiceSize) => {
      const tray = trayRef.current
      if (!tray) return
      const { bounds, position } = measure(tray)
      if (bounds.width === 0) return
      const size = clampSize(wanted, bounds, position)
      setLayout((current) => ({ ...current, size }))
    },
    [trayRef],
  )

  // A smaller window, or a different host, can leave a saved arrangement partly out of reach.
  const { open, host } = watch
  useEffect(() => {
    if (!arrangeable) return
    function refit() {
      const tray = trayRef.current
      const current = layoutRef.current
      if (!tray || !isArranged(current)) return
      const { bounds, size: box } = measure(tray)
      if (bounds.width === 0) return
      const position = current.position ? clampPosition(current.position, bounds, box) : null
      const anchor = position ?? measure(tray).position
      const size = current.size ? clampSize(current.size, bounds, anchor) : null
      const same =
        position?.right === current.position?.right &&
        position?.bottom === current.position?.bottom &&
        size?.width === current.size?.width &&
        size?.height === current.size?.height
      if (!same) setLayout({ ...current, position, size })
    }
    refit()
    window.addEventListener('resize', refit)
    return () => window.removeEventListener('resize', refit)
  }, [arrangeable, trayRef, host, open])

  const startMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const tray = trayRef.current
      if (!arrangeable || !tray || event.button !== 0) return
      event.preventDefault()
      const start = measure(tray).position
      setDragging(true)
      stopTracking.current?.()
      stopTracking.current = track(
        event,
        (dx, dy) => place({ right: start.right - dx, bottom: start.bottom - dy }),
        () => setDragging(false),
      )
    },
    [arrangeable, trayRef, place],
  )

  const startResize = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const tray = trayRef.current
      if (!arrangeable || !tray || event.button !== 0) return
      event.preventDefault()
      const { size } = measure(tray)
      const start = { width: size.width, height: size.height }
      setDragging(true)
      stopTracking.current?.()
      stopTracking.current = track(
        event,
        // The tray is anchored at the bottom right, so dragging its top-left corner grows it.
        (dx, dy) => resizeTo({ width: start.width - dx, height: start.height - dy }),
        () => setDragging(false),
      )
    },
    [arrangeable, trayRef, resizeTo],
  )

  const reset = useCallback(
    () => setLayout((current) => ({ ...current, position: null, size: null })),
    [],
  )

  const moveByKey = useCallback(
    (event: KeyboardEvent) => {
      const tray = trayRef.current
      if (!tray) return
      if (event.key === 'Home') {
        event.preventDefault()
        reset()
        return
      }
      const step = moveSteps[event.key]
      if (!step) return
      event.preventDefault()
      const distance = event.shiftKey ? bigNudge : nudge
      const { position } = measure(tray)
      place({
        right: position.right + step[0] * distance,
        bottom: position.bottom + step[1] * distance,
      })
    },
    [trayRef, place, reset],
  )

  const resizeByKey = useCallback(
    (event: KeyboardEvent) => {
      const tray = trayRef.current
      if (!tray) return
      if (event.key === 'Home') {
        event.preventDefault()
        reset()
        return
      }
      const step = moveSteps[event.key]
      if (!step) return
      event.preventDefault()
      const distance = event.shiftKey ? bigNudge : nudge
      const { size } = measure(tray)
      // Left and up make it bigger, like dragging the top-left corner that way.
      resizeTo({
        width: size.width + step[0] * distance,
        height: size.height + step[1] * distance,
      })
    },
    [trayRef, reset, resizeTo],
  )

  const setPinned = useCallback(
    (pinned: boolean) => setLayout((current) => ({ ...current, pinned })),
    [],
  )

  const arranged = arrangeable && isArranged(layout)
  // Once moved, the tray leaves the dock and floats against the screen; the button stays put.
  const trayStyle: CSSProperties | undefined = arranged
    ? {
        ...(layout.position && {
          position: 'fixed',
          zIndex: 1,
          right: layout.position.right,
          bottom: layout.position.bottom,
        }),
        ...(layout.size && {
          width: layout.size.width,
          height: layout.size.height,
          maxHeight: layout.size.height,
        }),
      }
    : undefined

  return {
    arrangeable,
    arranged,
    dragging,
    trayRef,
    trayStyle,
    pinned: arrangeable && layout.pinned,
    setPinned,
    reset,
    startMove,
    startResize,
    moveByKey,
    resizeByKey,
  }
}

export type DiceArrangement = ReturnType<typeof useDiceLayout>
