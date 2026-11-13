// `npm run art:placeholder`: writes simple procedural stand-ins for the camp
// layers, all in the master palette, so the pipeline and the checks have real
// files to work on. Every entry is marked PLACEHOLDER in the manifest.

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { panorama } from '../../src/features/campaigns/camp/campLayout.ts'
import { masterBiome, masterFixed } from '../../src/features/campaigns/camp/masterPalette.ts'
import { hexToRgb } from '../../src/features/campaigns/camp/oklab.ts'
import type { Manifest, ManifestLayer } from './checkArt.ts'
import { encodeIndexedPng } from './png.ts'
import { artDir, manifestPath, readManifest } from './paths.ts'

const { width, height } = panorama

// Cheap deterministic noise, so reruns write identical bytes.
const noise = (x: number, y: number) => {
  let value = Math.imul(x * 374761393 + y * 668265263, 1274126177)
  value = Math.imul(value ^ (value >>> 13), 1103515245)
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296
}

type Layer = {
  id: string
  parallax: number
  colors: readonly string[]
  paint: (x: number, y: number) => number | null
}

const sky = masterBiome.sky
const haze = masterBiome.haze
const ground = masterBiome.ground
const rock = masterBiome.rock
const foliage = masterBiome.foliage

const layers: Layer[] = [
  {
    id: 'sky',
    parallax: 0.1,
    colors: [...sky, ...masterFixed.star],
    paint: (x, y) => {
      if (y < 70 && noise(x, y) > 0.992) return 4 + (noise(y, x) > 0.5 ? 1 : 0)
      const band = (y / height) * 3.2
      const step = Math.min(3, Math.floor(band))
      const dither = (x + y) % 2 === 0 && band - step > 0.7 ? 1 : 0
      return Math.min(3, step + dither)
    },
  },
  {
    id: 'ridge',
    parallax: 0.3,
    colors: [...haze],
    paint: (x, y) => {
      const crest = 150 + Math.sin(x / 61) * 16 + Math.sin(x / 23) * 6
      if (y < crest) return null
      return y < crest + 3 ? 2 : y < crest + 40 ? 1 : 0
    },
  },
  {
    id: 'trees',
    parallax: 0.6,
    colors: [...foliage],
    paint: (x, y) => {
      const trunk = x % 47 < 14
      const crest = 170 + (trunk ? -Math.abs((x % 47) - 7) * 4 : 0) + Math.sin(x / 31) * 5
      if (y < crest) return null
      return y < crest + 4 ? 3 : y < crest + 30 ? 2 : 1
    },
  },
  {
    id: 'ground',
    parallax: 1,
    colors: [...ground, ...rock],
    paint: (x, y) => {
      const top = 222 + Math.sin(x / 80) * 3
      if (y < top) return null
      if (y < top + 2) return 3
      if (noise(x, y) > 0.985) return 6
      return y < top + 14 ? 2 : y < top + 34 ? 1 : 0
    },
  },
]

mkdirSync(artDir, { recursive: true })
const manifest: Manifest = readManifest(panorama)
manifest.panorama = { ...panorama }

for (const layer of layers) {
  const palette: Array<readonly [number, number, number]> = [
    [0, 0, 0],
    ...layer.colors.map(hexToRgb),
  ]
  const indices = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const color = layer.paint(x, y)
      indices[y * width + x] = color === null ? 0 : color + 1
    }
  }
  const file = `placeholder-${layer.id}.png`
  writeFileSync(
    join(artDir, file),
    encodeIndexedPng({ width, height, palette, indices, transparent: true }),
  )
  const entry: ManifestLayer = {
    id: layer.id,
    file,
    width,
    height,
    status: 'placeholder',
    parallax: layer.parallax,
    provenance: 'PLACEHOLDER: procedural stand-in from scripts/camp-art/placeholder.ts',
  }
  manifest.layers = [...manifest.layers.filter(({ id }) => id !== layer.id), entry]
}

manifest.layers.sort((a, b) => (a.parallax ?? 1) - (b.parallax ?? 1))
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
console.log(`Wrote ${layers.length} PLACEHOLDER layer(s) to ${artDir}`)
