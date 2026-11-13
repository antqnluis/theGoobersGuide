import { useEffect, useMemo, useRef, useState } from 'react'
import { adventurerImage, loadCampImages, outlineImage, type CampImages } from './campAssets'
import { planScene, type DrawOp } from './campDrawPlan'
import {
  embers,
  firelight,
  flame,
  hearth,
  particles,
  skyFxBottom,
  smoke,
  twinkles,
  type FxArea,
  type FxRect,
} from './campFx'
import type { CampLocationId } from './campLayout'
import { baseSpriteId, frameSpriteId, outlineTargets, type PartyFigure } from './campParty'
import { campRamps, variantKey, type CampWorld } from './campPalette'
import { layerOffset, layerOrigin, parallax, projectToDevice, type View } from './campProjection'
import { breathMs, type CampRig, type RigFrame } from './campRig'

function drawOp(context: CanvasRenderingContext2D, source: CanvasImageSource, op: DrawOp) {
  context.save()
  context.translate(op.dx + (op.flipX ? op.dw : 0), op.dy + (op.flipY ? op.dh : 0))
  context.scale(op.flipX ? -1 : 1, op.flipY ? -1 : 1)
  context.drawImage(source, op.sx, op.sy, op.sw, op.sh, 0, 0, op.dw, op.dh)
  context.restore()
}

/** Fills rectangles, each placed in device pixels by `place`. */
function fillRects(
  context: CanvasRenderingContext2D,
  rects: FxRect[],
  place: (rect: FxRect) => FxRect,
) {
  for (const rect of rects) {
    const device = place(rect)
    context.globalAlpha = rect.alpha ?? 1
    context.fillStyle = rect.color
    context.fillRect(device.x, device.y, device.w, device.h)
  }
  context.globalAlpha = 1
}

/**
 * The camp's pixel scene, drawn from the camera rig's frames: the art canvas
 * (whole base-pixel layers at an integer scale, with the party), a canvas for the
 * highlighted destination's outline, and a canvas of procedural effects. It is
 * decoration only (aria-hidden); every destination also exists as a DOM button.
 */
export default function CampLandscape({
  world,
  view,
  dpr,
  rig,
  figures,
  highlight,
  onReady,
  onFail,
}: {
  world: CampWorld
  /** The measured scene; its camera fields are ignored in favour of the rig's. */
  view: View
  /** Device pixels per CSS pixel, so the canvas box is exactly its pixel size. */
  dpr: number
  rig: CampRig
  /** The seated party, drawn around the fire. */
  figures: readonly PartyFigure[]
  /** The destination to outline: hovered, focused, or open. */
  highlight: CampLocationId | null
  onReady: () => void
  onFail: () => void
}) {
  const artRef = useRef<HTMLCanvasElement>(null)
  const outlineRef = useRef<HTMLCanvasElement>(null)
  const fxRef = useRef<HTMLCanvasElement>(null)
  // The art is paired with the variant it was loaded for, so a change of world
  // keeps showing the old frame until the new art is ready.
  const [loaded, setLoaded] = useState<{ variant: string; images: CampImages } | null>(null)
  const variant = variantKey(world)
  const ramps = useMemo(() => campRamps(world), [world])
  // The newest highlight, for frames drawn between renders.
  const highlightRef = useRef(highlight)
  const redrawOutline = useRef<(() => void) | null>(null)

  useEffect(() => {
    let cancelled = false
    loadCampImages(world).then(
      (images) => {
        if (!cancelled) setLoaded({ variant, images })
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

  // The world's art plus both breathing frames of every distinct party look.
  const images = loaded?.variant === variant ? loaded.images : null
  const all = useMemo(() => {
    if (!images) return null
    const merged: CampImages = { ...images }
    for (const { spriteId, look } of figures) {
      merged[spriteId] ??= adventurerImage(spriteId, look, 0)
      merged[frameSpriteId(spriteId, 1)] ??= adventurerImage(spriteId, look, 1)
    }
    return merged
  }, [images, figures])

  // The outline lives on its own canvas, so hovering never redraws the scene.
  useEffect(() => {
    highlightRef.current = highlight
    redrawOutline.current?.()
  }, [highlight])

  useEffect(() => {
    const art = artRef.current
    const outline = outlineRef.current
    const fx = fxRef.current
    if (!art || !outline || !fx || !all) return
    for (const canvas of [art, outline, fx]) {
      if (canvas.width !== view.deviceWidth) canvas.width = view.deviceWidth
      if (canvas.height !== view.deviceHeight) canvas.height = view.deviceHeight
    }
    const artContext = art.getContext('2d', { alpha: false })
    const outlineContext = outline.getContext('2d')
    const fxContext = fx.getContext('2d')
    if (!artContext || !outlineContext || !fxContext) {
      onFail()
      return
    }
    for (const context of [artContext, outlineContext, fxContext]) {
      context.imageSmoothingEnabled = false
    }
    const sizes = Object.fromEntries(
      Object.entries(all).map(([id, { width, height }]) => [id, { width, height }]),
    )
    const { scale } = view
    const visible = view.deviceWidth / scale
    const visibleHeight = view.deviceHeight / scale

    let drawn: { key: string; ops: DrawOp[] } | null = null

    const drawOutline = () => {
      outlineContext.clearRect(0, 0, outline.width, outline.height)
      if (!drawn) return
      const targets = outlineTargets(highlightRef.current, figures)
      for (const op of drawn.ops) {
        const image = targets.has(baseSpriteId(op.id)) ? all[op.id] : undefined
        if (!image) continue
        const ring = outlineImage(image)
        drawOp(outlineContext, ring.source, {
          ...op,
          sw: ring.width,
          sh: ring.height,
          dx: op.dx - scale,
          dy: op.dy - scale,
          dw: op.dw + 2 * scale,
          dh: op.dh + 2 * scale,
        })
      }
    }
    redrawOutline.current = drawOutline

    const drawArt = (frame: RigFrame, force: boolean) => {
      const scene: View = { ...view, cameraX: frame.cameraX, cameraY: frame.cameraY }
      const bob = Math.floor(frame.time / breathMs)
      const key = `${frame.cameraX}|${frame.cameraY}|${bob}`
      if (!force && drawn?.key === key) return
      const ops = planScene(scene, world.kind, sizes, figures, bob)
      artContext.fillStyle = ramps.sky[0]
      artContext.fillRect(0, 0, art.width, art.height)
      for (const op of ops) {
        const image = all[op.id]
        if (image) drawOp(artContext, image.source, op)
      }
      drawn = { key, ops }
      drawOutline()
    }

    const drawFx = (frame: RigFrame) => {
      const scene: View = { ...view, cameraX: frame.cameraX, cameraY: frame.cameraY }
      fxContext.clearRect(0, 0, fx.width, fx.height)
      const lift = highlightRef.current === 'overview' ? 1 : 0
      const top = Math.min(0, 270 - Math.ceil(visibleHeight) - 8)
      // The part of the panorama in view, with some margin, for particles.
      const area: FxArea = {
        left: frame.cameraX - 8,
        right: frame.cameraX + visible + 8,
        top,
        bottom: 270,
      }
      const ground = (rect: FxRect): FxRect => {
        const at = projectToDevice(rect, scene)
        return { ...rect, x: at.x, y: at.y, w: rect.w * scale, h: rect.h * scale }
      }
      // Sky effects move with the sky layer, so they follow its slower parallax.
      const skyOrigin = layerOrigin(scene, parallax.sky)
      const skyShift = layerOffset(frame.cameraX, parallax.sky)
      const sky = (rect: FxRect): FxRect => ({
        ...rect,
        x: (rect.x - skyShift) * scale,
        y: skyOrigin.y + rect.y * scale,
        w: rect.w * scale,
        h: rect.h * scale,
      })
      const skyArea: FxArea = {
        left: skyShift - 8,
        right: skyShift + visible + 8,
        top: top - Math.round(frame.cameraY * parallax.sky),
        bottom: skyFxBottom,
      }

      fillRects(fxContext, twinkles(frame.tick, skyArea), sky)
      fillRects(fxContext, hearth(frame.tick), sky)
      fillRects(fxContext, firelight(frame.tick, frame.flare, lift), ground)
      fillRects(fxContext, particles(world.kind, frame.tick, area), ground)
      fillRects(fxContext, smoke(frame.tick), ground)
      fillRects(fxContext, flame(frame.tick, frame.flare, lift), ground)
      fillRects(fxContext, embers(frame.tick, frame.flare), ground)
    }

    const render = (frame: RigFrame, force = false) => {
      drawArt(frame, force || frame.moved)
      drawFx(frame)
    }

    render(rig.frame(), true)
    onReady()
    const unsubscribe = rig.subscribe((frame) => render(frame))
    return () => {
      unsubscribe()
      redrawOutline.current = null
    }
  }, [all, view, world.kind, ramps, figures, rig, onReady, onFail])

  // Sized from device pixels, not the container, so a fractional-height box
  // never stretches the art off the pixel grid.
  const style = { width: view.deviceWidth / dpr, height: view.deviceHeight / dpr }
  return (
    <>
      <canvas
        aria-hidden="true"
        className="camp-canvas"
        data-camp-canvas
        ref={artRef}
        style={style}
      />
      <canvas
        aria-hidden="true"
        className="camp-canvas camp-canvas--overlay"
        data-camp-outline
        ref={outlineRef}
        style={style}
      />
      <canvas
        aria-hidden="true"
        className="camp-canvas camp-canvas--overlay"
        data-camp-fx
        ref={fxRef}
        style={style}
      />
    </>
  )
}
