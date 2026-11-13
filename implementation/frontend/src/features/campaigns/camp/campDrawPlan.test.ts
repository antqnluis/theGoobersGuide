import { describe, expect, it } from 'vitest'
import { assetIdsFor, landscapeIds, sceneProps } from './campArt'
import { pixelScale, restCameraX, visibleWidth } from './campCamera'
import { planScene, type ImageSizes } from './campDrawPlan'
import { panorama } from './campLayout'
import type { CampKind } from './campPalette'
import type { View } from './campProjection'

const kinds: CampKind[] = ['terrestrial', 'desert', 'volcanic', 'frozen', 'rocky', 'gas']

function viewFor(width: number, height: number, dpr = 1): View {
  const deviceWidth = width * dpr
  const deviceHeight = height * dpr
  const scale = pixelScale(deviceHeight, deviceWidth)
  return {
    cameraX: restCameraX(visibleWidth(deviceWidth, scale)),
    scale,
    deviceWidth,
    deviceHeight,
  }
}

const sizes: ImageSizes = Object.fromEntries(
  sceneProps.map(({ id }) => [id, { width: 50, height: 30 }]),
)

describe('landscape assets', () => {
  it('names a ridge, mid layer, and ground for every world type', () => {
    for (const kind of kinds) {
      const ids = assetIdsFor(kind)
      const { ridge, mid, ground } = landscapeIds(kind)
      expect(ids).toEqual(expect.arrayContaining(['sky', ridge, mid, ground, 'foreground']))
      expect(new Set(ids).size).toBe(ids.length)
    }
    expect(landscapeIds('terrestrial')).toEqual({ ridge: 'ridge', mid: 'trees', ground: 'ground' })
    expect(landscapeIds('gas').mid).toBe('mid-gas')
  })

  it('has art on disk for every id', async () => {
    const { artUrl } = await import('./campArt')
    for (const kind of kinds) for (const id of assetIdsFor(kind)) expect(artUrl(id)).toBeTruthy()
  })
})

describe('planScene', () => {
  it.each([
    [1280, 720, 1],
    [1440, 900, 1],
    [3440, 1440, 1],
    [375, 667, 3],
  ])('draws whole device pixels in a back-to-front order at %i x %i', (width, height, dpr) => {
    const view = viewFor(width, height, dpr)
    const ops = planScene(view, 'terrestrial', sizes)
    for (const op of ops) {
      for (const value of [op.dx, op.dy, op.dw, op.dh]) expect(Number.isInteger(value)).toBe(true)
    }
    const order = ops.map(({ id }) => id)
    const firstOf = (id: string) => order.indexOf(id)
    expect(firstOf('sky')).toBe(0)
    expect(firstOf('ridge')).toBeGreaterThan(firstOf('sky'))
    expect(firstOf('trees')).toBeGreaterThan(firstOf('ridge'))
    expect(firstOf('ground')).toBeGreaterThan(firstOf('trees'))
    expect(order.lastIndexOf('foreground')).toBe(order.length - 1)
  })

  it('anchors the panorama to the bottom and fills the sky above it', () => {
    const view = viewFor(1440, 900)
    const ops = planScene(view, 'terrestrial', sizes)
    const ground = ops.find(({ id }) => id === 'ground')!
    expect(ground.dy + ground.dh).toBe(view.deviceHeight)
    const sky = ops.filter(({ id }) => id === 'sky')
    expect(sky.length).toBeGreaterThan(1)
    expect(Math.min(...sky.map(({ dy }) => dy))).toBeLessThanOrEqual(0)
    expect(sky.some(({ flipY }) => flipY)).toBe(true)
    // The repeat covers the space above the panorama without gaps.
    const above = sky.filter(({ dy }) => dy < ground.dy + ground.dh - 270 * view.scale)
    const spans = above.toSorted((a, b) => a.dy - b.dy)
    for (let index = 1; index < spans.length; index += 1) {
      if (spans[index].dy !== spans[index - 1].dy) {
        expect(spans[index].dy).toBe(spans[index - 1].dy + spans[index - 1].dh)
      }
    }
  })

  it('moves far layers less than near ones as the camera moves', () => {
    const view = viewFor(1440, 900)
    const moved = { ...view, cameraX: view.cameraX + 100 }
    const shift = (id: string) => {
      const before = planScene(view, 'terrestrial', sizes).find((op) => op.id === id)!
      const after = planScene(moved, 'terrestrial', sizes).find((op) => op.id === id)!
      return before.dx - after.dx
    }
    expect(shift('sky')).toBeLessThan(shift('ridge'))
    expect(shift('ridge')).toBeLessThan(shift('trees'))
    expect(shift('trees')).toBeLessThan(shift('ground'))
    expect(shift('ground')).toBe(100 * view.scale)
  })

  it('mirrors the layers to fill a view wider than the panorama', () => {
    const view = viewFor(3440, 800)
    expect(view.deviceWidth).toBeGreaterThan(panorama.width * view.scale)
    const ground = planScene(view, 'terrestrial', sizes).filter(({ id }) => id === 'ground')
    expect(ground.length).toBeGreaterThanOrEqual(2)
    expect(ground.some(({ flipX }) => flipX)).toBe(true)
    expect(Math.min(...ground.map(({ dx }) => dx))).toBeLessThanOrEqual(0)
    expect(Math.max(...ground.map(({ dx, dw }) => dx + dw))).toBeGreaterThanOrEqual(
      view.deviceWidth,
    )
  })

  it('pins the foreground frames to the edges of the view', () => {
    for (const [width, height] of [
      [1440, 900],
      [3440, 1440],
      [375, 812],
    ]) {
      const view = viewFor(width, height, width === 375 ? 3 : 1)
      const frames = planScene(view, 'terrestrial', sizes).filter(({ id }) => id === 'foreground')
      expect(frames).toHaveLength(2)
      expect(frames[0].dx).toBe(0)
      expect(frames[1].dx + frames[1].dw).toBe(view.deviceWidth)
    }
  })

  it('leaves out props that are off screen, and flips mirrored bedrolls', () => {
    const phone = viewFor(375, 812, 3)
    const ids = planScene(phone, 'terrestrial', sizes).map(({ id }) => id)
    expect(ids).toContain('firepit')
    expect(ids).not.toContain('waystone')
    const wide = planScene(viewFor(3440, 1440), 'terrestrial', sizes)
    expect(wide.find(({ id }) => id === 'bedroll-blue')?.flipX).toBe(true)
    expect(wide.find(({ id }) => id === 'bedroll-red')?.flipX).toBeFalsy()
  })

  it('draws props back to front by their feet', () => {
    const ops = planScene(viewFor(3440, 1440), 'terrestrial', sizes)
    const feet = ops.filter((op) => sizes[op.id]).map((op) => op.dy + op.dh)
    expect(feet).toEqual([...feet].sort((a, b) => a - b))
  })
})
