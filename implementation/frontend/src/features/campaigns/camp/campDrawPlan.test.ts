import { encodeSprite } from './customSprite'
import { describe, expect, it } from 'vitest'
import { assetIdsFor, landscapeIds, sceneProps } from './campArt'
import { pixelScale, restCameraX, visibleWidth } from './campCamera'
import { foregroundBand, foregroundSplit, planScene, type ImageSizes } from './campDrawPlan'
import { frameSpriteId, partyFigures, type PartyFigure } from './campParty'
import { panorama, shrineStone, shrineStoneLit, tent } from './campLayout'
import type { CampKind } from './campPalette'
import { projectToDevice, type View } from './campProjection'

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
  [...sceneProps.map(({ id }) => id), shrineStoneLit].map((id) => [id, { width: 50, height: 30 }]),
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

describe('the shrine stone', () => {
  const view = viewFor(1280, 720)

  it('stands idle by default and glows, in the same place, while visions wait', () => {
    const idle = planScene(view, 'terrestrial', sizes)
    const lit = planScene(view, 'terrestrial', sizes, [], 0, true)
    const idleOp = idle.find(({ id }) => id === shrineStone.id)
    const litOp = lit.find(({ id }) => id === shrineStoneLit)
    expect(idle.some(({ id }) => id === shrineStoneLit)).toBe(false)
    expect(lit.some(({ id }) => id === shrineStone.id)).toBe(false)
    expect(litOp).toEqual({ ...idleOp, id: shrineStoneLit })
    expect(lit).toHaveLength(idle.length)
  })

  it('falls back to the idle sprite when the glowing one has not loaded', () => {
    const withoutLit = Object.fromEntries(
      Object.entries(sizes).filter(([id]) => id !== shrineStoneLit),
    )
    const ops = planScene(view, 'terrestrial', withoutLit, [], 0, true)
    expect(ops.some(({ id }) => id === shrineStone.id)).toBe(true)
  })

  it('has art on disk for the glowing sprite', async () => {
    const { artUrl } = await import('./campArt')
    expect(artUrl(shrineStoneLit)).toBeTruthy()
    expect(assetIdsFor('terrestrial')).toContain(shrineStoneLit)
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

  it('pins the foreground trees to the edges of the view', () => {
    for (const [width, height] of [
      [1440, 900],
      [3440, 1440],
      [375, 812],
    ]) {
      const view = viewFor(width, height, width === 375 ? 3 : 1)
      const frames = planScene(view, 'terrestrial', sizes).filter(({ id }) => id === 'foreground')
      const left = frames.filter(({ sx }) => sx === 0)
      const right = frames.filter(({ sx }) => sx !== 0)
      expect(left.length).toBeGreaterThanOrEqual(2)
      expect(right).toHaveLength(left.length)
      for (const frame of left) expect(frame.dx).toBe(0)
      for (const frame of right) expect(frame.dx + frame.dw).toBe(view.deviceWidth)
    }
  })

  it.each([
    [1440, 900, 1],
    [1440, 1100, 1],
    [3440, 1440, 1],
    [2000, 1009, 1],
    [375, 812, 3],
    [1280, 720, 1],
  ])(
    'runs the trees from the canopy at the top of the screen to the ground at %i x %i',
    (width, height, dpr) => {
      const view = viewFor(width, height, dpr)
      const frames = planScene(view, 'terrestrial', sizes)
        .filter(({ id }) => id === 'foreground')
        .filter(({ sx }) => sx === 0)
      const { scale } = view
      // The canopy touches the top of the screen and the trunk reaches the bottom.
      const canopy = frames.find(({ sy }) => sy === 0)!
      expect(canopy.dy).toBe(0)
      expect(canopy.dh).toBe(foregroundSplit * scale)
      const trunk = frames.find(({ sy, sh }) => sy === foregroundSplit && sh > foregroundBand)!
      expect(trunk.dy + trunk.dh).toBe(view.deviceHeight)
      // Between them, the bark leaves no gap: the pieces join edge to edge.
      const spans = frames.map(({ dy, dh }) => [dy, dy + dh]).toSorted((a, b) => a[0] - b[0])
      let covered = 0
      for (const [top, bottom] of spans) {
        expect(top).toBeLessThanOrEqual(covered)
        covered = Math.max(covered, bottom)
      }
      expect(covered).toBe(view.deviceHeight)
      for (const op of frames) {
        for (const value of [op.dx, op.dy, op.dw, op.dh]) expect(Number.isInteger(value)).toBe(true)
      }
      // Bark copies alternate, starting flipped against the trunk.
      const bark = frames
        .filter(({ sy, sh }) => sy === foregroundSplit && sh === foregroundBand)
        .toSorted((a, b) => b.dy - a.dy)
      bark.forEach((op, index) => expect(Boolean(op.flipY)).toBe(index % 2 === 0))
    },
  )

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

describe('planScene with a party', () => {
  const view = viewFor(1440, 900)
  const roster = Array.from({ length: 10 }, (_, index) => ({
    profile_id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    role: index === 0 ? 'owner' : 'member',
    username: `player_${index}`,
  }))
  const { figures } = partyFigures(roster)
  const ops = planScene(view, 'terrestrial', sizes, figures)
  // Members start on alternate breathing frames, so a figure's op id depends on its phase.
  const opId = (figure: PartyFigure, bob = 0) =>
    frameSpriteId(figure.spriteId, (bob + figure.phase) % 2)

  it('draws each figure as a whole-pixel 16 x 16 sprite standing on its seat', () => {
    for (const figure of figures) {
      const op = ops.find(({ id }) => id === opId(figure))!
      expect(op).toBeDefined()
      expect([op.dw, op.dh]).toEqual([16 * view.scale, 16 * view.scale])
      for (const value of [op.dx, op.dy]) expect(Number.isInteger(value)).toBe(true)
      expect(op.flipX).toBe(figure.flip)
    }
  })

  it('draws a 32 x 32 custom sprite 24 art pixels across, on the same seat', () => {
    const custom = encodeSprite(new Uint8ClampedArray(32 * 32 * 4).fill(255))!
    const { figures: withCustom } = partyFigures(
      roster,
      undefined,
      undefined,
      new Map([[roster[1].profile_id, custom]]),
    )
    const figure = withCustom[1]
    expect(figure.size).toBe(24)
    const id = frameSpriteId(figure.spriteId, figure.phase % 2)
    const customOps = planScene(
      view,
      'terrestrial',
      { ...sizes, [id]: { width: 32, height: 32 } },
      withCustom,
    )
    const op = customOps.find((candidate) => candidate.id === id)!
    expect([op.sw, op.sh]).toEqual([32, 32])
    expect([op.dw, op.dh]).toEqual([24 * view.scale, 24 * view.scale])
    const plain = ops.find(({ id: plainId }) => plainId === opId(figures[1]))!
    expect(op.dy + op.dh).toBe(plain.dy + plain.dh)
  })

  it('draws a figure on a bedroll after it, and the back seats before the fire pit', () => {
    const order = ops.map(({ id }) => id)
    expect(order.indexOf(opId(figures[0]))).toBeGreaterThan(order.indexOf('bedroll-red'))
    expect(order.indexOf(opId(figures[1]))).toBeGreaterThan(order.indexOf('bedroll-blue'))
    expect(order.indexOf(opId(figures[6]))).toBeLessThan(order.indexOf('bedroll-red'))
    expect(order.lastIndexOf('foreground')).toBe(order.length - 1)
  })

  it('adds nothing for an empty party', () => {
    expect(planScene(view, 'terrestrial', sizes, [])).toEqual(planScene(view, 'terrestrial', sizes))
  })

  it('breathes: the party alternates frames and never all at once', () => {
    const first = planScene(view, 'terrestrial', sizes, figures, 0).map(({ id }) => id)
    const second = planScene(view, 'terrestrial', sizes, figures, 1).map(({ id }) => id)
    expect(first).not.toEqual(second)
    for (const figure of figures) {
      expect(first).toContain(opId(figure, 0))
      expect(second).toContain(opId(figure, 1))
    }
    expect(new Set(figures.map(({ phase }) => phase)).size).toBe(2)
  })
})

describe('planScene during the landfall descent', () => {
  const rest = viewFor(1440, 900)
  const high = { ...rest, cameraY: 40 }
  const find = (view: View, id: string) =>
    planScene(view, 'terrestrial', sizes).find((op) => op.id === id)!

  const trunkOf = (view: View) =>
    planScene(view, 'terrestrial', sizes).find(
      ({ id, sy, sh, sx }) =>
        id === 'foreground' && sx === 0 && sy === foregroundSplit && sh > foregroundBand,
    )!
  const high_foreground = () => trunkOf(high)
  const rest_foreground = () => trunkOf(rest)

  it('slides each layer down by its own share, so the sky barely moves', () => {
    const drop = (id: string) => find(high, id).dy - find(rest, id).dy
    expect(drop('sky')).toBe(Math.round(40 * 0.1) * rest.scale)
    expect(drop('ridge')).toBeGreaterThan(drop('sky'))
    expect(drop('trees')).toBeGreaterThan(drop('ridge'))
    expect(drop('ground')).toBe(40 * rest.scale)
    const trunkDrop = high_foreground().dy - rest_foreground().dy
    expect(trunkDrop).toBeGreaterThan(drop('ground'))
  })

  it('draws the tent larger than its sprite, in whole art pixels, standing on the same spot', () => {
    const op = find(rest, 'empty-tent')
    const width = Math.round(sizes['empty-tent'].width * tent.scale!)
    const height = Math.round(sizes['empty-tent'].height * tent.scale!)
    expect(op.dw).toBe(width * rest.scale)
    expect(op.dh).toBe(height * rest.scale)
    expect(op.dw).toBeGreaterThan(sizes['empty-tent'].width * rest.scale)
    const foot = projectToDevice(tent, rest)
    expect(op.dy + op.dh).toBe(foot.y)
    expect(op.dx + Math.floor(width / 2) * rest.scale).toBe(foot.x)
  })

  it('moves props with the ground and keeps every coordinate whole', () => {
    expect(find(high, 'wagon').dy - find(rest, 'wagon').dy).toBe(40 * rest.scale)
    for (const op of planScene(high, 'terrestrial', sizes)) {
      for (const value of [op.dx, op.dy, op.dw, op.dh]) expect(Number.isInteger(value)).toBe(true)
    }
  })

  it('still covers the space above the sky while the camera looks up', () => {
    const sky = planScene(high, 'terrestrial', sizes).filter(({ id }) => id === 'sky')
    const bottoms = sky.map(({ dy, dh }) => dy + dh)
    const tops = sky.map(({ dy }) => dy)
    expect(Math.min(...tops)).toBeLessThanOrEqual(0)
    expect(Math.max(...bottoms)).toBeGreaterThanOrEqual(high.deviceHeight)
  })
})
