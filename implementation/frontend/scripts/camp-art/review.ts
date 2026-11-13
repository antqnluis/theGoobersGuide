// `npm run art:review -- <outDir> [kind]`: composites the shipped camp art
// into a preview panorama at 1x and zoomed crops at 4x, optionally recoloured
// for a world type, so plates can be judged the way the renderer will draw them.

import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { partySeats } from '../../src/features/campaigns/camp/campLayout.ts'
import {
  applyPaletteSwap,
  buildSwapLut,
  campRamps,
  packRgba,
} from '../../src/features/campaigns/camp/campPalette.ts'
import { planetAppearance } from '../../src/features/campaigns/planetModel.ts'
import { decodeIndices, parsePng } from './png.ts'
import { artDir } from './paths.ts'

const [outDir = '.', kind = 'terrestrial'] = process.argv.slice(2)
mkdirSync(outDir, { recursive: true })

// Find a campaign id whose planet is the requested world type.
let world = planetAppearance('review-0')
for (let index = 0; world.kind !== kind && index < 5000; index += 1) {
  world = planetAppearance(`review-${index}`)
}
const lut =
  world.kind === 'terrestrial' && kind === 'terrestrial' ? null : buildSwapLut(campRamps(world))

type Sprite = { width: number; height: number; pixels: Uint32Array }
function load(id: string): Sprite {
  const png = parsePng(readFileSync(join(artDir, `${id}.png`)))
  const indices = decodeIndices(png)
  const pixels = new Uint32Array(indices.length)
  indices.forEach((index, at) => {
    const clear = png.transparency[index] === 0
    pixels[at] = clear ? 0 : packRgba(png.palette[index])
  })
  if (lut) applyPaletteSwap(pixels, lut)
  return { width: png.width, height: png.height, pixels }
}

const W = 960
const H = 270
const canvas = new Uint32Array(W * H)
function blit(sprite: Sprite, left: number, top: number, flip = false) {
  for (let y = 0; y < sprite.height; y += 1) {
    for (let x = 0; x < sprite.width; x += 1) {
      const pixel = sprite.pixels[y * sprite.width + (flip ? sprite.width - 1 - x : x)]
      const cx = left + x
      const cy = top + y
      if (pixel >>> 24 === 255 && cx >= 0 && cx < W && cy >= 0 && cy < H)
        canvas[cy * W + cx] = pixel
    }
  }
}
/** Places a sprite with its bottom centre on a ground position. */
function stand(id: string, x: number, y: number, flip = false) {
  const sprite = load(id)
  blit(sprite, Math.round(x - sprite.width / 2), y - sprite.height, flip)
}

for (const layer of ['sky', 'ridge', 'trees', 'ground']) blit(load(layer), 0, 0)
stand('wagon', 190, 244)
stand('empty-tent', 300, 240)
stand('firepit', 480, 244)
const rolls = ['red', 'blue', 'green', 'purple', 'gold', 'cream']
rolls.forEach((color, index) => {
  const seat = partySeats[index]
  stand(`bedroll-${color}`, seat.x, seat.y + 14, seat.x > 480)
})
stand('map-table', 690, 242)
stand('journal-crates', 770, 244)
stand('waystone', 880, 252)
blit(load('foreground'), 0, 0)

const rgba = Buffer.from(canvas.buffer)
const base = sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
await base
  .clone()
  .png()
  .toFile(join(outDir, `panorama-${kind}-1x.png`))
await base
  .clone()
  .extract({ left: 360, top: 0, width: 240, height: 270 })
  .resize(960, 1080, { kernel: 'nearest' })
  .png()
  .toFile(join(outDir, `fire-${kind}-4x.png`))
console.log(`Wrote previews for ${world.kind} to ${outDir}`)
