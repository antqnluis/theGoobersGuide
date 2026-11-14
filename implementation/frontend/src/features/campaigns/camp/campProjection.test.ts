import { describe, expect, it } from 'vitest'
import { cameraToPlace, pixelScale, restCameraX, visibleWidth } from './campCamera'
import { campLocations, panorama } from './campLayout'
import {
  hitRect,
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
  const scale = pixelScale(deviceHeight, deviceWidth)
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

describe('frame checks', () => {
  it('reports a target outside the camera frame as off-frame', () => {
    const view = viewFor(375, 812, 3, 190)
    const far = hitRect({ x: 900, y: 230 }, { width: 40, height: 60 }, view, 3)
    expect(isInFrame(far, { width: 375, height: 812 })).toBe(false)
  })
})

describe('hit targets at the resting camera', () => {
  function restView(width: number, height: number, dpr: number): View {
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

  it.each([
    [1280, 720, 1],
    [1440, 900, 1],
    [1920, 1080, 1],
    [3440, 1440, 1],
    [1440, 900, 2],
    [844, 390, 3],
  ])('shows every destination inside the %i x %i scene (dpr %i)', (width, height, dpr) => {
    // The wagon stands left of the tent, off-frame at a wide rest view: the Places list opens
    // it and the camera pans there (see the reveal test below).
    for (const { id, world, hit } of campLocations.filter(({ id }) => id !== 'settings')) {
      const rect = hitRect(world, hit, restView(width, height, dpr), dpr)
      expect(isInFrame(rect, { width, height }), id).toBe(true)
    }
  })

  it.each([
    [1280, 720, 1],
    [1440, 900, 1],
    [1920, 1080, 1],
    [1440, 900, 2],
    [844, 390, 3],
    [375, 812, 3],
  ])(
    'brings the tent and the wagon into the %i x %i scene when their place is revealed (dpr %i)',
    (width, height, dpr) => {
      for (const id of ['characters', 'settings']) {
        const place = campLocations.find((location) => location.id === id)!
        const base = restView(width, height, dpr)
        const visible = visibleWidth(base.deviceWidth, base.scale)
        const view = { ...base, cameraX: cameraToPlace(place.world.x, visible) }
        expect(isInFrame(hitRect(place.world, place.hit, view, dpr), { width, height }), id).toBe(
          true,
        )
      }
    },
  )

  it('never makes a target smaller than 44 CSS pixels', () => {
    for (const { world, hit } of campLocations) {
      const rect = hitRect(world, hit, restView(375, 812, 3), 3)
      expect(rect.width).toBeGreaterThanOrEqual(44)
      expect(rect.height).toBeGreaterThanOrEqual(44)
    }
  })

  it('stands the target on the object, its bottom edge at the foot', () => {
    const view = restView(1440, 900, 1)
    const { world, hit } = campLocations[0]
    const rect = hitRect(world, hit, view, 1)
    expect(rect.top + rect.height).toBe(Math.round(projectToDevice(world, view).y))
    expect(rect.left + rect.width / 2).toBeCloseTo(projectToDevice(world, view).x, 0)
  })
})
