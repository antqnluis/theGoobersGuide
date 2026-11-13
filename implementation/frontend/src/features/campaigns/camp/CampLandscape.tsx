import { useEffect, useMemo, useRef, useState } from 'react'
import { loadCampImages, type CampImages } from './campAssets'
import { planScene } from './campDrawPlan'
import { campRamps, variantKey, type CampWorld } from './campPalette'
import type { View } from './campProjection'

/**
 * The camp's pixel scene: one 2D canvas at device resolution, drawn from whole
 * base-pixel layers at an integer scale. It is decoration only (aria-hidden);
 * every destination also exists as a DOM button.
 */
export default function CampLandscape({
  world,
  view,
  dpr,
  onReady,
  onFail,
}: {
  world: CampWorld
  view: View
  /** Device pixels per CSS pixel, so the canvas box is exactly its pixel size. */
  dpr: number
  onReady: () => void
  onFail: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [images, setImages] = useState<CampImages | null>(null)
  const variant = variantKey(world)
  const ramps = useMemo(() => campRamps(world), [world])

  useEffect(() => {
    let cancelled = false
    loadCampImages(world).then(
      (loaded) => {
        if (!cancelled) setImages(loaded)
      },
      () => {
        if (!cancelled) onFail()
      },
    )
    return () => {
      cancelled = true
    }
    // The variant key captures everything about the world that changes the art.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, onFail])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !images) return
    if (canvas.width !== view.deviceWidth) canvas.width = view.deviceWidth
    if (canvas.height !== view.deviceHeight) canvas.height = view.deviceHeight
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) {
      onFail()
      return
    }
    context.imageSmoothingEnabled = false
    context.fillStyle = ramps.sky[0]
    context.fillRect(0, 0, canvas.width, canvas.height)
    const sizes = Object.fromEntries(
      Object.entries(images).map(([id, { width, height }]) => [id, { width, height }]),
    )
    for (const op of planScene(view, world.kind, sizes)) {
      const image = images[op.id]
      if (!image) continue
      context.save()
      context.translate(op.dx + (op.flipX ? op.dw : 0), op.dy + (op.flipY ? op.dh : 0))
      context.scale(op.flipX ? -1 : 1, op.flipY ? -1 : 1)
      context.drawImage(image.source, op.sx, op.sy, op.sw, op.sh, 0, 0, op.dw, op.dh)
      context.restore()
    }
    onReady()
  }, [images, view, world.kind, ramps, onReady, onFail])

  return (
    <canvas
      aria-hidden="true"
      className="camp-canvas"
      data-camp-canvas
      ref={canvasRef}
      // Sized from device pixels, not the container, so a fractional-height box
      // never stretches the art off the pixel grid.
      style={{ width: view.deviceWidth / dpr, height: view.deviceHeight / dpr }}
    />
  )
}
