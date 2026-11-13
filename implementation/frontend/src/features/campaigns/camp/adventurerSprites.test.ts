import { describe, expect, it } from 'vitest'
import {
  adventurerAppearance,
  cloakCount,
  headwear,
  packs,
  skinCount,
} from './adventurerAppearance'
import { adventurerSize, composeAdventurer, renderAdventurer } from './adventurerSprites'
import { masterColors, masterFixed } from './masterPalette'
import { hexToRgb } from './oklab'
import { packRgba } from './campPalette'

const base = { headwear: 'bare', pack: 'none' } as const

describe('adventurer sprites', () => {
  it('draws every combination at the declared size with master colours only', () => {
    const allowed = new Set(masterColors())
    for (const hat of headwear) {
      for (const pack of packs) {
        const pixels = composeAdventurer({ headwear: hat, pack })
        expect(pixels).toHaveLength(adventurerSize.width * adventurerSize.height)
        expect(pixels.filter(Boolean).length).toBeGreaterThan(60)
        for (const color of pixels) if (color) expect(allowed.has(color)).toBe(true)
      }
    }
  })

  it('looks different for every headwear and pack', () => {
    const looks = headwear.flatMap((hat) =>
      packs.map((pack) => composeAdventurer({ headwear: hat, pack }).join()),
    )
    expect(new Set(looks).size).toBe(headwear.length * packs.length)
  })

  it('recolours only the cloak and skin ramps', () => {
    const first = renderAdventurer({ ...base, cloak: 0, skin: 0 })
    const second = renderAdventurer({ ...base, cloak: 3, skin: 2 })
    const cloak0 = new Set(masterFixed.cloak0.map((hex) => packRgba(hexToRgb(hex))))
    const skin0 = new Set(masterFixed.skin0.map((hex) => packRgba(hexToRgb(hex))))
    const swapped = (pixel: number) => cloak0.has(pixel) || skin0.has(pixel)
    let changed = 0
    first.forEach((pixel, index) => {
      if (swapped(pixel)) {
        expect(second[index]).not.toBe(pixel)
        changed += 1
      } else {
        expect(second[index]).toBe(pixel)
      }
    })
    expect(changed).toBeGreaterThan(30)
  })

  it('keeps transparent pixels clear and renders every seeded look', () => {
    for (let index = 0; index < 100; index += 1) {
      const look = adventurerAppearance(`profile-${index}`)
      expect(look.cloak).toBeLessThan(cloakCount)
      expect(look.skin).toBeLessThan(skinCount)
      const pixels = renderAdventurer(look)
      expect(pixels[0]).toBe(0)
      expect(pixels.some((pixel) => pixel >>> 24 === 255)).toBe(true)
    }
  })
})
