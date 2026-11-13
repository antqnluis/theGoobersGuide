import { describe, expect, it } from 'vitest'
import { planetAppearance } from '../planetModel'
import { adventurerAppearance, cloakCount, skinCount } from './adventurerAppearance'
import {
  applyPaletteSwap,
  biomeMaterials,
  biomes,
  buildSwapLut,
  campRamps,
  masterBiome,
  colorsForMaterials,
  masterColors,
  materialNames,
  masterFixed,
  packRgba,
  variantKey,
} from './campPalette'
import { hexToRgb, labToRgb, rgbToHex, rgbToLab } from './oklab'

// Every (world type, palette) pair the galaxy can produce.
function allWorlds() {
  const worlds = new Map<string, ReturnType<typeof planetAppearance>>()
  for (let index = 0; index < 4000 && worlds.size < 12; index += 1) {
    const world = planetAppearance(`campaign-${index}`)
    worlds.set(variantKey(world), world)
  }
  return [...worlds.values()]
}

describe('master palette', () => {
  it('has no duplicate colours, so every pixel names exactly one material', () => {
    const colors = masterColors()
    expect(new Set(colors).size).toBe(colors.length)
    expect(colors.every((color) => /^#[0-9a-f]{6}$/.test(color))).toBe(true)
  })

  it('is little-endian RGBA when packed', () => {
    expect(new Uint8Array(new Uint32Array([1]).buffer)[0]).toBe(1)
    const bytes = new Uint8Array(new Uint32Array([packRgba([1, 2, 3])]).buffer)
    expect([...bytes]).toEqual([1, 2, 3, 255])
  })

  it('round-trips OKLab within one channel step', () => {
    for (const color of masterColors()) {
      const rgb = hexToRgb(color)
      const back = labToRgb(rgbToLab(rgb))
      expect(Math.max(...back.map((value, index) => Math.abs(value - rgb[index])))).toBeLessThan(2)
      expect(rgbToHex(rgb)).toBe(color)
    }
  })
})

describe('colorsForMaterials', () => {
  it('returns only the named materials and rejects unknown ones', () => {
    expect(colorsForMaterials(['ground', 'rock'])).toEqual([
      ...masterBiome.ground,
      ...masterBiome.rock,
    ])
    expect(() => colorsForMaterials(['lava'])).toThrow(/Unknown material/)
  })

  it('names every material in the master palette', () => {
    expect(colorsForMaterials(materialNames)).toHaveLength(masterColors().length)
  })
})

describe('campRamps', () => {
  const worlds = allWorlds()

  it('covers all 6 world types with 2 palettes each', () => {
    expect(worlds).toHaveLength(12)
    expect(new Set(worlds.map(({ kind }) => kind))).toEqual(new Set(Object.keys(biomes)))
  })

  it.each(worlds.map((world) => [variantKey(world), world] as const))(
    '%s recolours every master swatch to its own ramp',
    (_key, world) => {
      const ramps = campRamps(world)
      const lut = buildSwapLut(ramps)
      const pixels = new Uint32Array(
        biomeMaterials.flatMap((material) =>
          masterBiome[material].map((color) => packRgba(hexToRgb(color))),
        ),
      )
      applyPaletteSwap(pixels, lut)
      const expected = biomeMaterials.flatMap((material) =>
        ramps[material].map((color) => packRgba(hexToRgb(color))),
      )
      expect([...pixels]).toEqual(expected)
    },
  )

  it.each(worlds.map((world) => [variantKey(world), world] as const))(
    '%s keeps ramps ordered dark to light and every target distinct',
    (_key, world) => {
      const ramps = campRamps(world)
      const targets: string[] = []
      for (const material of biomeMaterials) {
        const lightness = ramps[material].map((color) => rgbToLab(hexToRgb(color))[0])
        expect(lightness).toEqual([...lightness].sort((a, b) => a - b))
        expect(new Set(ramps[material]).size).toBe(4)
        targets.push(...ramps[material])
      }
      expect(new Set(targets).size).toBe(targets.length)
      // Recoloured biome colours must not collide with fixed materials.
      const fixed = new Set(Object.values(masterFixed).flat())
      expect(targets.filter((color) => fixed.has(color))).toEqual([])
    },
  )

  it('is deterministic and differs between world types', () => {
    const [first, second] = [worlds[0], worlds.find(({ kind }) => kind !== worlds[0].kind)!]
    expect(campRamps(first)).toEqual(campRamps(first))
    expect(campRamps(first).ground).not.toEqual(campRamps(second).ground)
  })
})

describe('applyPaletteSwap', () => {
  const lut = buildSwapLut(campRamps(planetAppearance('swap')))

  it('passes transparent, translucent, and unmatched pixels through', () => {
    const master = packRgba(hexToRgb(masterBiome.ground[1]))
    const translucent = packRgba(hexToRgb(masterBiome.ground[1]), 128)
    const clear = 0
    const unmatched = packRgba([12, 34, 56])
    const fire = packRgba(hexToRgb(masterFixed.fire[2]))
    const pixels = new Uint32Array([master, translucent, clear, unmatched, fire])
    applyPaletteSwap(pixels, lut)
    expect(pixels[0]).not.toBe(master)
    expect([...pixels.slice(1)]).toEqual([translucent, clear, unmatched, fire])
  })
})

describe('adventurerAppearance', () => {
  it('is deterministic per profile and independent of the planet seed', () => {
    const id = '00000000-0000-4000-8000-000000000001'
    expect(adventurerAppearance(id)).toEqual(adventurerAppearance(id))
    expect(adventurerAppearance(id)).not.toEqual(adventurerAppearance(id + '2'))
  })

  it('stays inside the available ramps and shows no class or stats', () => {
    for (let index = 0; index < 200; index += 1) {
      const look = adventurerAppearance(`profile-${index}`)
      expect(look.cloak).toBeGreaterThanOrEqual(0)
      expect(look.cloak).toBeLessThan(cloakCount)
      expect(look.skin).toBeLessThan(skinCount)
      expect(Object.keys(look).sort()).toEqual(['cloak', 'headwear', 'pack', 'skin'])
    }
  })

  it('uses every cloak and skin ramp that has master colours', () => {
    for (let index = 0; index < cloakCount; index += 1)
      expect(masterFixed[`cloak${index}`]).toBeDefined()
    for (let index = 0; index < skinCount; index += 1)
      expect(masterFixed[`skin${index}`]).toBeDefined()
    const cloaks = new Set(
      Array.from({ length: 300 }, (_, i) => adventurerAppearance(`p${i}`).cloak),
    )
    expect(cloaks.size).toBe(cloakCount)
  })
})
