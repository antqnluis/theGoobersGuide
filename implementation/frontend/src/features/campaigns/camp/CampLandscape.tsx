import { useEffect, useMemo, useRef, useState } from 'react'
import { adventurerImage, loadCampImages, outlineImage, type CampImages } from './campAssets'
import { planScene } from './campDrawPlan'
import type { CampLocationId } from './campLayout'
import { outlineTargets, type PartyFigure } from './campParty'
import { campRamps, variantKey, type CampWorld } from './campPalette'
import type { View } from './campProjection'

type Op = ReturnType<typeof planScene>[number]

function drawOp(context: CanvasRenderingContext2D, source: CanvasImageSource, op: Op) {
  context.save()
  context.translate(op.dx + (op.flipX ? op.dw : 0), op.dy + (op.flipY ? op.dh : 0))
  context.scale(op.flipX ? -1 : 1, op.flipY ? -1 : 1)
  context.drawImage(source, op.sx, op.sy, op.sw, op.sh, 0, 0, op.dw, op.dh)
  context.restore()
}

/**
 * The camp's pixel scene: one 2D canvas at device resolution, drawn from whole
 * base-pixel layers at an integer scale, plus a second canvas for the outline of
 * the highlighted destination. It is decoration only (aria-hidden); every
 * destination also exists as a DOM button.
 */
export default function CampLandscape({
  world,
  view,
  dpr,
  figures,
  highlight,
  onReady,
  onFail,
}: {
  world: CampWorld
  view: View
  /** Device pixels per CSS pixel, so the canvas box is exactly its pixel size. */
  dpr: number
  /** The seated party, drawn around the fire. */
  figures: readonly PartyFigure[]
  /** The destination to outline: hovered, focused, or open. */
  highlight: CampLocationId | null
  onReady: () => void
  onFail: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const outlineRef = useRef<HTMLCanvasElement>(null)
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

  // The world's art plus one sprite per distinct party look.
  const all = useMemo(() => {
    if (!images) return null
    const merged: CampImages = { ...images }
    for (const { spriteId, look } of figures) merged[spriteId] ??= adventurerImage(spriteId, look)
    return merged
  }, [images, figures])

  const ops = useMemo(() => {
    if (!all) return null
    const sizes = Object.fromEntries(
      Object.entries(all).map(([id, { width, height }]) => [id, { width, height }]),
    )
    return planScene(view, world.kind, sizes, figures)
  }, [all, view, world.kind, figures])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !all || !ops) return
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
    for (const op of ops) {
      const image = all[op.id]
      if (image) drawOp(context, image.source, op)
    }
    onReady()
  }, [all, ops, view, ramps, onReady, onFail])

  // The outline sits on its own canvas, so hovering never redraws the scene.
  useEffect(() => {
    const canvas = outlineRef.current
    if (!canvas || !all || !ops) return
    if (canvas.width !== view.deviceWidth) canvas.width = view.deviceWidth
    if (canvas.height !== view.deviceHeight) canvas.height = view.deviceHeight
    const context = canvas.getContext('2d')
    if (!context) return
    context.imageSmoothingEnabled = false
    context.clearRect(0, 0, canvas.width, canvas.height)
    const targets = outlineTargets(highlight, figures)
    for (const op of ops) {
      const image = targets.has(op.id) ? all[op.id] : undefined
      if (!image) continue
      const outline = outlineImage(image)
      drawOp(context, outline.source, {
        ...op,
        sw: outline.width,
        sh: outline.height,
        dx: op.dx - view.scale,
        dy: op.dy - view.scale,
        dw: op.dw + 2 * view.scale,
        dh: op.dh + 2 * view.scale,
      })
    }
  }, [all, ops, highlight, figures, view])

  // Sized from device pixels, not the container, so a fractional-height box
  // never stretches the art off the pixel grid.
  const style = { width: view.deviceWidth / dpr, height: view.deviceHeight / dpr }
  return (
    <>
      <canvas
        aria-hidden="true"
        className="camp-canvas"
        data-camp-canvas
        ref={canvasRef}
        style={style}
      />
      <canvas
        aria-hidden="true"
        className="camp-canvas camp-canvas--outline"
        data-camp-outline
        ref={outlineRef}
        style={style}
      />
    </>
  )
}
