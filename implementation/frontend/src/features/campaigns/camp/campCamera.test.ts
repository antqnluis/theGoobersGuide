import { describe, expect, it } from 'vitest'
import {
  cameraToFrame,
  cameraToPlace,
  clampCameraX,
  descentOffset,
  easeInOutCubic,
  panFinished,
  panPosition,
  panelSideForWorldX,
  pixelScale,
  restCameraX,
  retarget,
  startPan,
  visibleWidth,
} from './campCamera'
import { campLocations, panorama } from './campLayout'

// [css width, css height, device pixel ratio] for every viewport the plan names.
const viewports = [
  [320, 568, 1],
  [375, 812, 3],
  [768, 1024, 2],
  [1024, 768, 1],
  [1440, 900, 1],
  [1920, 1080, 1],
  [3440, 1440, 1],
  [844, 390, 3],
] as const

describe('pixelScale and visibleWidth', () => {
  it('uses whole-number scales that never drop below 1', () => {
    expect(pixelScale(100)).toBe(1)
    expect(pixelScale(900)).toBe(3)
    expect(pixelScale(1080)).toBe(4)
    expect(pixelScale(2436)).toBe(9)
  })

  it('caps the scale so a narrow view still shows 280 base pixels', () => {
    // A 1536 px wide tablet in portrait: height alone would allow 7x.
    expect(pixelScale(2048, 1536)).toBe(5)
    expect(pixelScale(1338, 1125)).toBe(4)
    expect(pixelScale(1080, 1920)).toBe(4)
  })

  it('reports the base pixels visible across the view', () => {
    expect(visibleWidth(1440, 3)).toBe(480)
    expect(visibleWidth(3440, 5)).toBe(688)
  })
})

describe('clampCameraX', () => {
  it.each(viewports)('stays inside the panorama at %i x %i (dpr %i)', (width, height, dpr) => {
    const scale = pixelScale(height * dpr, width * dpr)
    const visible = visibleWidth(width * dpr, scale)
    for (const requested of [-5000, 0, 137.4, 480, 5000]) {
      const x = clampCameraX(requested, visible)
      expect(Number.isInteger(x)).toBe(true)
      if (visible < panorama.width) {
        expect(x).toBeGreaterThanOrEqual(0)
        expect(x + visible).toBeLessThanOrEqual(panorama.width + 1)
      } else {
        expect(x).toBe(Math.round((panorama.width - visible) / 2))
      }
    }
  })

  it('centres a view wider than the panorama regardless of the request', () => {
    expect(clampCameraX(0, 1200)).toBe(clampCameraX(900, 1200))
  })
})

describe('framing', () => {
  it('puts the place on the open side opposite the docked panel', () => {
    const visible = 480
    // Panel on the right covering 31%: the place lands in the left part.
    const right = cameraToFrame({ worldX: 480, visible, panelFraction: 0.31, panelSide: 'right' })!
    const rightScreen = (480 - right) / visible
    expect(rightScreen).toBeGreaterThan(0.25)
    expect(rightScreen).toBeLessThan(0.45)
    const left = cameraToFrame({ worldX: 480, visible, panelFraction: 0.31, panelSide: 'left' })!
    const leftScreen = (480 - left) / visible
    expect(leftScreen).toBeGreaterThan(0.55)
    expect(leftScreen).toBeLessThan(0.8)
  })

  it('docks panels opposite their place', () => {
    expect(panelSideForWorldX(190)).toBe('right')
    expect(panelSideForWorldX(590)).toBe('left')
  })

  it('leaves the camera alone for a full-screen sheet', () => {
    expect(cameraToFrame({ worldX: 480, visible: 281, panelFraction: 1 })).toBeNull()
  })

  it.each(viewports)(
    'keeps every destination reachable at %i x %i (dpr %i)',
    (width, height, dpr) => {
      const visible = visibleWidth(width * dpr, pixelScale(height * dpr, width * dpr))
      for (const { world } of campLocations) {
        const x = cameraToPlace(world.x, visible)
        expect(Number.isInteger(x)).toBe(true)
        if (visible < panorama.width) {
          // The place is inside the frame whenever the clamp allows it.
          expect(world.x).toBeGreaterThanOrEqual(x)
          expect(world.x).toBeLessThanOrEqual(x + visible)
        }
      }
    },
  )
})

describe('pans', () => {
  it('eases from start to end in whole pixels and finishes exactly', () => {
    const pan = startPan(100, 300, 1000, 350)
    expect(panPosition(pan, 1000)).toBe(100)
    expect(panPosition(pan, 1175)).toBe(200)
    expect(panPosition(pan, 1350)).toBe(300)
    expect(panPosition(pan, 5000)).toBe(300)
    expect(panFinished(pan, 1349)).toBe(false)
    expect(panFinished(pan, 1350)).toBe(true)
    for (let t = 1000; t <= 1350; t += 7) expect(Number.isInteger(panPosition(pan, t))).toBe(true)
  })

  it('retargets from the current position without queueing', () => {
    const first = startPan(0, 400, 0, 400)
    const midway = panPosition(first, 200)
    const second = retarget(first, 100, 200, 300)
    expect(second.from).toBe(midway)
    expect(second.to).toBe(100)
    expect(second.start).toBe(200)
    // Ten rapid retargets leave a single pan whose end is the last request.
    let pan = first
    for (let index = 0; index < 10; index += 1) pan = retarget(pan, index * 10, 200 + index, 300)
    expect(pan.to).toBe(90)
  })

  it('treats a zero duration as instant for reduced motion', () => {
    const pan = startPan(10, 250, 0, 0)
    expect(panPosition(pan, 0)).toBe(250)
    expect(panFinished(pan, 0)).toBe(true)
  })

  it('has a monotone ease between 0 and 1', () => {
    let previous = 0
    for (let t = 0; t <= 1; t += 0.05) {
      const value = easeInOutCubic(t)
      expect(value).toBeGreaterThanOrEqual(previous)
      previous = value
    }
    expect(easeInOutCubic(-1)).toBe(0)
    expect(easeInOutCubic(2)).toBe(1)
  })
})

describe('descentOffset', () => {
  it('starts at the full extent and settles at zero', () => {
    expect(descentOffset(0, 120)).toBe(120)
    expect(descentOffset(1, 120)).toBe(0)
    expect(Number.isInteger(descentOffset(0.37, 120))).toBe(true)
  })
})

describe('restCameraX', () => {
  it('is an integer inside the panorama at every viewport', () => {
    for (const [width, height, dpr] of viewports) {
      const visible = visibleWidth(width * dpr, pixelScale(height * dpr, width * dpr))
      const x = restCameraX(visible)
      expect(Number.isInteger(x)).toBe(true)
      expect(x).toBe(clampCameraX(x, visible))
    }
  })
})
