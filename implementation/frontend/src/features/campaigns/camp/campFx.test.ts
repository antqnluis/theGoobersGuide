import { describe, expect, it } from 'vitest'
import {
  embers,
  shrineGlow,
  firelight,
  flame,
  flameBase,
  hash01,
  hearth,
  hearthStar,
  particles,
  skyFxBottom,
  smoke,
  twinkles,
  type FxArea,
  type FxRect,
} from './campFx'
import { shrineStone } from './campLayout'
import type { CampKind } from './campPalette'
import { masterColors, masterFixed } from './masterPalette'

const kinds: CampKind[] = ['terrestrial', 'desert', 'volcanic', 'frozen', 'rocky', 'gas']
const area: FxArea = { left: 144, right: 624, top: -40, bottom: 270 }
const allowed = new Set(masterColors())

const everyColourIsMaster = (rects: FxRect[]) =>
  rects.every((rect) => allowed.has(rect.color.toLowerCase()))

describe('hash01', () => {
  it('is deterministic and spread across [0, 1)', () => {
    expect(hash01(3, 4, 5)).toBe(hash01(3, 4, 5))
    const values = Array.from({ length: 500 }, (_, index) => hash01(index))
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true)
    expect(new Set(values).size).toBeGreaterThan(490)
    expect(Math.min(...values)).toBeLessThan(0.05)
    expect(Math.max(...values)).toBeGreaterThan(0.95)
  })
})

describe('fire', () => {
  it('rises from the fire pit in the fire ramp, narrower at the tips', () => {
    for (let tick = 0; tick < 30; tick += 1) {
      const rects = flame(tick)
      expect(rects.length).toBeGreaterThan(8)
      for (const rect of rects) {
        expect(Math.abs(rect.x - flameBase.x)).toBeLessThanOrEqual(7)
        expect(rect.y + rect.h).toBeLessThanOrEqual(flameBase.y)
        expect(masterFixed.fire).toContain(rect.color)
      }
      const top = Math.min(...rects.map(({ y }) => y))
      expect(flameBase.y - top).toBeLessThan(30)
    }
  })

  it('flickers, flares taller, and brightens when lifted', () => {
    const height = (rects: FxRect[]) => flameBase.y - Math.min(...rects.map(({ y }) => y))
    const frames = new Set(Array.from({ length: 20 }, (_, tick) => JSON.stringify(flame(tick))))
    expect(frames.size).toBeGreaterThan(10)
    expect(height(flame(5, 1))).toBeGreaterThan(height(flame(5, 0)))
    expect(height(flame(5, 0, 1))).toBeGreaterThanOrEqual(height(flame(5, 0, 0)))
  })

  it('gives off light, embers, and smoke that stay near the fire', () => {
    for (const tick of [0, 7, 19]) {
      for (const rect of [...firelight(tick), ...embers(tick), ...smoke(tick)]) {
        expect(Math.abs(rect.x - flameBase.x)).toBeLessThan(80)
        expect(rect.y).toBeLessThan(flameBase.y + 30)
        expect(rect.y).toBeGreaterThan(flameBase.y - 100)
        expect(rect.alpha ?? 1).toBeGreaterThan(0)
        expect(rect.alpha ?? 1).toBeLessThanOrEqual(1)
      }
    }
    expect(firelight(3, 1)[0].alpha!).toBeGreaterThan(firelight(3, 0)[0].alpha!)
    expect(embers(3, 1).length).toBeGreaterThan(embers(3, 0).length)
  })

  it('draws only master palette colours', () => {
    const rects = [...flame(4, 0.5), ...firelight(4), ...embers(4), ...smoke(4)]
    expect(everyColourIsMaster(rects)).toBe(true)
  })
})

describe('shrine glow', () => {
  it('keeps a few warm motes above the stone, in master palette colours', () => {
    for (const tick of [0, 9, 31]) {
      const motes = shrineGlow(tick)
      expect(motes.length).toBeGreaterThan(2)
      for (const mote of motes) {
        expect(Math.abs(mote.x - shrineStone.x)).toBeLessThan(12)
        expect(mote.y).toBeLessThan(shrineStone.y)
        expect(mote.y).toBeGreaterThan(shrineStone.y - 60)
        expect(mote.alpha ?? 1).toBeGreaterThan(0)
      }
      expect(everyColourIsMaster(motes)).toBe(true)
    }
  })

  it('moves with the tick, and stands still when motion is reduced', () => {
    expect(shrineGlow(0)).not.toEqual(shrineGlow(11))
    expect(shrineGlow(0, true)).toEqual(shrineGlow(11, true))
    expect(shrineGlow(0, true).length).toBe(shrineGlow(0).length)
  })
})

describe('world particles', () => {
  it.each(kinds)('keeps %s particles inside the view, on the palette, and moving', (kind) => {
    const first = particles(kind, 10, area)
    expect(first.length).toBeGreaterThan(5)
    expect(everyColourIsMaster(first)).toBe(true)
    for (const rect of first) {
      expect(rect.x + rect.w).toBeGreaterThanOrEqual(area.left)
      expect(rect.x).toBeLessThanOrEqual(area.right)
      expect(rect.y).toBeGreaterThanOrEqual(area.top)
      expect(rect.y).toBeLessThanOrEqual(area.bottom)
    }
    expect(particles(kind, 10, area)).toEqual(first)
    expect(JSON.stringify(particles(kind, 11, area))).not.toBe(JSON.stringify(first))
  })

  it('lets snow fall through the sky above the panorama', () => {
    const rects = particles('frozen', 40, { ...area, top: -150 })
    expect(Math.min(...rects.map(({ y }) => y))).toBeLessThan(0)
  })

  it('has blinking fireflies and rising embers', () => {
    const lit = (tick: number) => particles('terrestrial', tick, area).length
    expect(new Set(Array.from({ length: 30 }, (_, tick) => lit(tick))).size).toBeGreaterThan(1)
    const rise = (tick: number) => Math.min(...particles('volcanic', tick, area).map(({ y }) => y))
    expect(rise(0)).toBeLessThan(250)
  })

  it('repeats across the panorama seam on wide views', () => {
    const wide = particles('desert', 5, { left: -300, right: 1300, top: 0, bottom: 270 })
    const narrow = particles('desert', 5, { left: 0, right: 960, top: 0, bottom: 270 })
    expect(wide.length).toBeGreaterThan(narrow.length)
  })
})

describe('sky', () => {
  it('keeps twinkles above every ridge line and clear of the hearth star', () => {
    for (let tick = 0; tick < 40; tick += 1) {
      for (const rect of twinkles(tick, { left: 0, right: 960, top: -100, bottom: skyFxBottom })) {
        expect(rect.y).toBeLessThanOrEqual(skyFxBottom)
        expect(Math.abs(rect.x - hearthStar.x) < 12 && Math.abs(rect.y - hearthStar.y) < 12).toBe(
          false,
        )
      }
    }
    const some = twinkles(3, { left: 0, right: 960, top: -100, bottom: skyFxBottom })
    expect(everyColourIsMaster(some)).toBe(true)
  })

  it('hangs the hearth star warm and low, breathing', () => {
    const rects = hearth(0)
    expect(rects.some((rect) => rect.color === masterFixed.fire[4])).toBe(true)
    for (const rect of rects) {
      expect(rect.y + rect.h).toBeLessThanOrEqual(hearthStar.y + 15)
      expect(masterFixed.fire.concat(masterFixed.star)).toContain(rect.color)
    }
    expect(JSON.stringify(hearth(0))).not.toBe(JSON.stringify(hearth(9)))
  })
})
