import { describe, expect, it } from 'vitest'
import { cameraToPlace, pixelScale, visibleWidth } from './campCamera'
import { campLocations, panorama } from './campLayout'
import {
  buttonRect,
  isInFrame,
  layerOffset,
  panoramaOrigin,
  parallax,
  projectToDevice,
  type View,
} from './campProjection'

function viewFor(width: number, height: number, dpr: number, worldX = 480): View {
  const deviceWidth = width * dpr
  const deviceHeight = height * dpr
  const scale = pixelScale(deviceHeight)
  return {
    cameraX: cameraToPlace(worldX, visibleWidth(deviceWidth, scale)),
    scale,
    deviceWidth,
    deviceHeight,
  }
}

describe('projection', () => {
  it('anchors the panorama to the bottom of the view', () => {
    const view = viewFor(1440, 900, 1)
    const origin = panoramaOrigin(view)
    expect(origin.y + panorama.height * view.scale).toBe(view.deviceHeight)
    expect(origin.x).toBe(-view.cameraX * view.scale)
  })

  it('projects whole device pixels for integer camera positions', () => {
    const view = viewFor(1440, 900, 1)
    const point = projectToDevice({ x: 480, y: 236 }, view)
    expect(Number.isInteger(point.x)).toBe(true)
    expect(Number.isInteger(point.y)).toBe(true)
  })

  it('moves one scaled pixel per camera pixel', () => {
    const view = viewFor(1440, 900, 1)
    const a = projectToDevice({ x: 480, y: 236 }, view)
    const b = projectToDevice({ x: 480, y: 236 }, { ...view, cameraX: view.cameraX + 1 })
    expect(a.x - b.x).toBe(view.scale)
  })

  it('lifts the picture during the landfall descent', () => {
    const rest = viewFor(1440, 900, 1)
    const lifted = { ...rest, cameraY: 40 }
    expect(panoramaOrigin(lifted).y - panoramaOrigin(rest).y).toBe(40 * rest.scale)
  })

  it('flags views wider than the panorama so edges can be filled', () => {
    expect(panoramaOrigin(viewFor(3440, 1440, 1)).extendsHorizontally).toBe(false)
    expect(
      panoramaOrigin({ cameraX: 0, scale: 1, deviceWidth: 1400, deviceHeight: 270 })
        .extendsHorizontally,
    ).toBe(true)
  })

  it('moves far layers less than near ones', () => {
    expect(layerOffset(200, parallax.sky)).toBeLessThan(layerOffset(200, parallax.trees))
    expect(layerOffset(200, parallax.ground)).toBe(200)
    expect(Number.isInteger(layerOffset(137, parallax.ridge))).toBe(true)
  })
})

describe('button placement', () => {
  const size = { width: 120, height: 48 }

  it.each([
    [1440, 900, 1],
    [375, 812, 3],
    [844, 390, 3],
  ])('puts each framed destination inside the viewport at %i x %i', (width, height, dpr) => {
    for (const { world } of campLocations) {
      const view = viewFor(width, height, dpr, world.x)
      const rect = buttonRect(world, view, dpr, size)
      expect(isInFrame(rect, { width, height })).toBe(true)
    }
  })

  it('reports a button outside the camera frame as off-frame', () => {
    const view = viewFor(375, 812, 3, 190)
    const far = buttonRect({ x: 900, y: 230 }, view, 3, size)
    expect(isInFrame(far, { width: 375, height: 812 })).toBe(false)
  })

  it('centres the rect on the projected point', () => {
    const view = viewFor(1440, 900, 1)
    const point = { x: 480, y: 236 }
    const device = projectToDevice(point, view)
    const rect = buttonRect(point, view, 1, size)
    expect(rect.left + rect.width / 2).toBeCloseTo(device.x, 0)
    expect(rect.top + rect.height / 2).toBeCloseTo(device.y, 0)
  })
})
