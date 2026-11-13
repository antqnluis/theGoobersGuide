// `npm run art:build`: converts every source image in art-src/camp into
// grid-exact, on-palette indexed PNGs in the camp art folder and records them
// in the manifest. A sidecar `<name>.json` can set `cell` (source pixels per art
// pixel), `key` (background colour to clear, "#rrggbb"), `parallax`, and
// `provenance` (the generation prompt).

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import sharp from 'sharp'
import { panorama } from '../../src/features/campaigns/camp/campLayout.ts'
import { masterColors } from '../../src/features/campaigns/camp/masterPalette.ts'
import { hexToRgb } from '../../src/features/campaigns/camp/oklab.ts'
import type { ManifestLayer } from './checkArt.ts'
import { encodeIndexedPng } from './png.ts'
import { artDir, manifestPath, readManifest, sourceDir } from './paths.ts'
import { detectGridSize, quantizeToGrid, toIndexedImage } from './quantize.ts'

type Sidecar = { cell?: number; key?: string; parallax?: number; provenance?: string }

const sources = existsSync(sourceDir)
  ? readdirSync(sourceDir).filter((name) => /\.(png|jpe?g|webp)$/i.test(name))
  : []
if (sources.length === 0) {
  console.log(`No source images in ${sourceDir}; nothing to build.`)
  process.exit(0)
}

const palette = masterColors().map(hexToRgb)
const manifest = readManifest(panorama)
mkdirSync(artDir, { recursive: true })

for (const name of sources) {
  const id = basename(name, extname(name))
  const sidecarPath = join(sourceDir, id + '.json')
  const sidecar: Sidecar = existsSync(sidecarPath)
    ? JSON.parse(readFileSync(sidecarPath, 'utf8'))
    : {}
  const { data, info } = await sharp(join(sourceDir, name))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const image = { data: new Uint8Array(data), width: info.width, height: info.height }
  const cell = sidecar.cell ?? detectGridSize(image)
  const quantized = quantizeToGrid(image, {
    palette,
    cell,
    key: sidecar.key ? hexToRgb(sidecar.key) : undefined,
  })
  const indexed = toIndexedImage(quantized, palette)
  const file = `${id}.png`
  writeFileSync(join(artDir, file), encodeIndexedPng(indexed))
  const entry: ManifestLayer = {
    id,
    file,
    width: indexed.width,
    height: indexed.height,
    status: 'final',
    parallax: sidecar.parallax,
    provenance: sidecar.provenance ?? `art-src/camp/${name}, grid ${cell}px`,
  }
  manifest.layers = [...manifest.layers.filter((layer) => layer.id !== id), entry]
  console.log(`${name}: grid ${cell}px -> ${indexed.width}x${indexed.height}`)
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
