// Hand-authored pixel sprites for party members, seated and facing right (mirror
// them for the left side of the fire). They use master palette colours only,
// with the cloak0 and skin0 ramps as stand-ins that the palette swap recolours
// per member, so every look stays on-palette and exact.

import type { AdventurerAppearance } from './adventurerAppearance.ts'
import { masterFixed } from './masterPalette.ts'
import { hexToRgb } from './oklab.ts'
import { packRgba } from './campPalette.ts'

export const adventurerSize = { width: 16, height: 16 } as const

/** Columns the body and head sit in from the left, leaving room for the pack. */
const bodyInset = 2

// Legend for the maps below. '.' is transparent.
const legend: Record<string, string> = {
  o: masterFixed.ink[0],
  a: masterFixed.cloak0[0],
  b: masterFixed.cloak0[1],
  c: masterFixed.cloak0[2],
  d: masterFixed.skin0[0],
  e: masterFixed.skin0[1],
  f: masterFixed.skin0[2],
  x: masterFixed.wood[0],
  w: masterFixed.wood[1],
  v: masterFixed.wood[2],
  g: masterFixed.brass[1],
  y: masterFixed.brass[2],
  n: masterFixed.canvas[1],
  m: masterFixed.canvas[2],
}

/** Torso, arms, and crossed legs, with the head left out. */
const body = [
  '..............',
  '..............',
  '..............',
  '..............',
  '..............',
  '..............',
  '.....ooooo....',
  '....obbbbbo...',
  '...obbcbbbbo..',
  '...obbcbbbfoo.',
  '...obbbbbbeeo.',
  '...oabbbbboo..',
  '...oaabbbbbooo',
  '..oaaaabbbbwxo',
  '..ooaaaaaaaooo',
  '....oooooooo..',
]

const heads: Record<AdventurerAppearance['headwear'], string[]> = {
  bare: [
    '.....oooo.....',
    '....oxxxxo....',
    '...oxxxxxxo...',
    '...oxxxfeeo...',
    '....oxfeeo....',
    '.....ofeo.....',
    '......oo......',
  ],
  hood: [
    '.....oooo.....',
    '....obbbbo....',
    '...obbbbbbo...',
    '...obbffeeo...',
    '...obbfeeo....',
    '....obbfo.....',
    '.....oo.......',
  ],
  hat: [
    '....oooooo....',
    '...onmmmmno...',
    '.ooonnnnnnooo.',
    '...oxxxfeeo...',
    '....oxfeeo....',
    '.....ofeo.....',
    '......oo......',
  ],
  cap: [
    '.....oooo.....',
    '....obbbbo....',
    '...obbbbbbo...',
    '...ooooooeoo..',
    '....oxfeeo....',
    '.....ofeo.....',
    '......oo......',
  ],
}

/** Drawn behind the body, on the figure's back (the left in a right-facing sprite). */
const packs: Record<AdventurerAppearance['pack'], string[]> = {
  none: [],
  satchel: [
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '.ooo..........',
    'ovwwo.........',
    'ovwgo.........',
    'owwwo.........',
    '.ooo..........',
  ],
  bedroll: [
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '..oooo........',
    '.onmmno.......',
    'onmmmmno......',
    'onnmmmno......',
    '.onnnno.......',
    '..oooo........',
  ],
  quiver: [
    '..............',
    '..............',
    '..............',
    '.....o.o......',
    '....ovoyo.....',
    '...ovwvwyo....',
    '...owwwwo.....',
    '..owwwwo......',
    '..owwwo.......',
    '..oxwo........',
    '...oo.........',
  ],
}

export type SpriteLayers = { pack: string[]; body: string[]; head: string[] }

export function spriteLayers(
  appearance: Pick<AdventurerAppearance, 'headwear' | 'pack'>,
): SpriteLayers {
  return { pack: packs[appearance.pack], body, head: heads[appearance.headwear] }
}

/**
 * The master-palette hex colour at each pixel of the finished 16x16 sprite, or
 * null where it is transparent. Later layers paint over earlier ones.
 */
export function composeAdventurer(
  appearance: Pick<AdventurerAppearance, 'headwear' | 'pack'>,
): Array<string | null> {
  const { width, height } = adventurerSize
  const out: Array<string | null> = new Array(width * height).fill(null)
  const paint = (rows: string[], top: number, inset: number) => {
    rows.forEach((row, y) => {
      for (let x = 0; x < width; x += 1) {
        const color = legend[row[x - inset] ?? '.']
        if (color && top + y < height) out[(top + y) * width + x] = color
      }
    })
  }
  const layers = spriteLayers(appearance)
  // Packs are authored from the sprite's top, bottom-aligned to the body.
  paint(layers.pack, height - layers.pack.length, 0)
  paint(layers.body, 0, bodyInset)
  paint(layers.head, 0, bodyInset)
  return out
}

export function spriteColors() {
  return Object.values(legend).map((hex) => hexToRgb(hex))
}

/**
 * The finished sprite as packed RGBA pixels, with the cloak0 and skin0 stand-in
 * ramps swapped for this member's cloak and skin. Transparent pixels are 0.
 */
export function renderAdventurer(
  appearance: Pick<AdventurerAppearance, 'headwear' | 'pack' | 'cloak' | 'skin'>,
): Uint32Array {
  const swap = new Map<string, string>()
  masterFixed.cloak0.forEach((hex, step) =>
    swap.set(hex, masterFixed[`cloak${appearance.cloak}`][step]),
  )
  masterFixed.skin0.forEach((hex, step) =>
    swap.set(hex, masterFixed[`skin${appearance.skin}`][step]),
  )
  return Uint32Array.from(composeAdventurer(appearance), (hex) =>
    hex ? packRgba(hexToRgb(swap.get(hex) ?? hex)) : 0,
  )
}
