import { useLayoutEffect, useState, type RefObject } from 'react'
import { pixelScale, restCameraX, visibleWidth } from './campCamera'
import type { View } from './campProjection'

export type CampMeasure = {
  view: View
  dpr: number
  /** The scene's size in CSS pixels. */
  cssWidth: number
  cssHeight: number
}

/**
 * Measures the scene in whole device pixels, so the canvas can be drawn 1:1.
 * It prefers the browser's exact `devicePixelContentBoxSize` and falls back to
 * rounding CSS size times the pixel ratio. It re-measures when the window,
 * the zoom level, or the pixel ratio changes. Null until measured.
 */
export function useCampView(ref: RefObject<HTMLElement | null>): CampMeasure | null {
  const [measure, setMeasure] = useState<CampMeasure | null>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === 'undefined') return

    let device: { width: number; height: number } | null = null
    const update = () => {
      const rect = element.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      const deviceWidth = device?.width ?? Math.round(rect.width * dpr)
      const deviceHeight = device?.height ?? Math.round(rect.height * dpr)
      if (deviceWidth < 1 || deviceHeight < 1) return
      const scale = pixelScale(deviceHeight, deviceWidth)
      const next: CampMeasure = {
        dpr,
        cssWidth: rect.width,
        cssHeight: rect.height,
        view: {
          cameraX: restCameraX(visibleWidth(deviceWidth, scale)),
          scale,
          deviceWidth,
          deviceHeight,
        },
      }
      setMeasure((previous) =>
        previous &&
        previous.dpr === next.dpr &&
        previous.cssWidth === next.cssWidth &&
        previous.cssHeight === next.cssHeight &&
        previous.view.deviceWidth === next.view.deviceWidth &&
        previous.view.deviceHeight === next.view.deviceHeight
          ? previous
          : next,
      )
    }

    const observer = new ResizeObserver(([entry]) => {
      const box = entry?.devicePixelContentBoxSize?.[0]
      device = box ? { width: box.inlineSize, height: box.blockSize } : null
      update()
    })
    try {
      observer.observe(element, { box: 'device-pixel-content-box' })
    } catch {
      observer.observe(element)
    }

    // A change of zoom or screen moves the pixel ratio without resizing the box.
    let ratioQuery: MediaQueryList | null = null
    const watchRatio = () => {
      ratioQuery?.removeEventListener('change', onRatioChange)
      ratioQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
      ratioQuery.addEventListener('change', onRatioChange)
    }
    function onRatioChange() {
      device = null
      update()
      watchRatio()
    }
    watchRatio()
    update()

    return () => {
      observer.disconnect()
      ratioQuery?.removeEventListener('change', onRatioChange)
    }
  }, [ref])

  return measure
}
