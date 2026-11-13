// `npm run art:build`: converts every source image in art-src/camp into
// grid-exact, on-palette indexed PNGs in the camp art folder and records them
// in the manifest. See art-src/camp/README.md for the sidecar options.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import sharp from 'sharp'
import { panorama } from '../../src/features/campaigns/camp/campLayout.ts'
import {
  colorsForMaterials,
  masterColors,
} from '../../src/features/campaigns/camp/masterPalette.ts'
import { hexToRgb } from '../../src/features/campaigns/camp/oklab.ts'
import type { ManifestLayer } from './checkArt.ts'
import { encodeIndexedPng } from './png.ts'
import { artDir, manifestPath, readManifest, sourceDir } from './paths.ts'
import { detectGridSize, quantizeToGrid, toIndexedImage, type Rgba } from './quantize.ts'
import { composeLayer, findBands, findSprites, type LayerPlacement } from './slice.ts'

type Sidecar = {
  /** Source pixels per art pixel, for a source that is already on a clean grid. */
  cell?: number
  /** Multiply the source by this before quantizing (for ungridded sources). */
  scale?: number
  /** Materials this asset may use. Restricting them keeps biome colours recolourable. */
  materials?: string[]
  /** Background colour to clear, "#rrggbb". */
  key?: string
  /** Place the result on a full-width panorama layer. */
  layer?: Omit<LayerPlacement, 'width' | 'height'>
  /**
   * One image holding several stacked layers, found as bands of painted rows.
   * Each entry names its band, in top-to-bottom order, and places it.
   */
  bands?: Array<{
    id: string
    layer: Omit<LayerPlacement, 'width' | 'height'>
    materials?: string[]
    parallax?: number
  }>
  /** Names of the objects on a sheet, in reading order. A single sprite needs none. */
  sprites?: string[]
  /** Objects closer than this many source pixels count as one sprite. */
  gap?: number
  parallax?: number
  provenance?: string
}

const sources = existsSync(sourceDir)
  ? readdirSync(sourceDir).filter((name) => /\.(png|jpe?g|webp)$/i.test(name))
  : []
if (sources.length === 0) {
  console.log(`No source images in ${sourceDir}; nothing to build.`)
  process.exit(0)
}

const manifest = readManifest(panorama)
mkdirSync(artDir, { recursive: true })

/** Clears pixels near the key colour, so they neither survive nor bleed when scaled. */
function keyToAlpha(image: Rgba, key: readonly [number, number, number], tolerance = 150) {
  const { data } = image
  for (let at = 0; at < data.length; at += 4) {
    const distance =
      Math.abs(data[at] - key[0]) +
      Math.abs(data[at + 1] - key[1]) +
      Math.abs(data[at + 2] - key[2])
    if (distance <= tolerance) data[at + 3] = 0
  }
}

async function scaled(image: Rgba, scale: number): Promise<Rgba> {
  if (scale === 1) return image
  const { data, info } = await sharp(Buffer.from(image.data), {
    raw: { width: image.width, height: image.height, channels: 4 },
  })
    .resize(
      Math.max(1, Math.round(image.width * scale)),
      Math.max(1, Math.round(image.height * scale)),
      {
        kernel: 'lanczos3',
      },
    )
    .raw()
    .toBuffer({ resolveWithObject: true })
  return { data: new Uint8Array(data), width: info.width, height: info.height }
}

function record(entry: ManifestLayer) {
  manifest.layers = [...manifest.layers.filter(({ id }) => id !== entry.id), entry]
}

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
  const source: Rgba = { data: new Uint8Array(data), width: info.width, height: info.height }
  if (sidecar.key) keyToAlpha(source, hexToRgb(sidecar.key))
  const palette = (sidecar.materials ? colorsForMaterials(sidecar.materials) : masterColors()).map(
    hexToRgb,
  )
  const provenance = sidecar.provenance ?? `art-src/camp/${name}`
  const quantize = (image: Rgba, cell: number) => quantizeToGrid(image, { palette, cell })
  const write = (outId: string, image: ReturnType<typeof toIndexedImage>, note: string) => {
    writeFileSync(join(artDir, `${outId}.png`), encodeIndexedPng(image))
    record({
      id: outId,
      file: `${outId}.png`,
      width: image.width,
      height: image.height,
      status: 'final',
      parallax: sidecar.parallax,
      provenance: `${provenance}; ${note}`,
    })
    console.log(`${name} -> ${outId}.png ${image.width}x${image.height} (${note})`)
  }

  if (sidecar.bands) {
    const found = findBands(source)
    if (found.length !== sidecar.bands.length) {
      throw new Error(
        `${name}: found ${found.length} band(s) but the sidecar names ${sidecar.bands.length}`,
      )
    }
    for (const [index, { top, bottom }] of found.entries()) {
      const band = sidecar.bands[index]
      const rows = source.data.slice(top * source.width * 4, bottom * source.width * 4)
      const small = await scaled(
        { data: rows, width: source.width, height: bottom - top },
        sidecar.scale ?? 1,
      )
      const bandPalette = (band.materials ?? sidecar.materials ?? []).length
        ? colorsForMaterials(band.materials ?? sidecar.materials!).map(hexToRgb)
        : palette
      const composed = composeLayer(quantizeToGrid(small, { palette: bandPalette, cell: 1 }), {
        ...band.layer,
        ...panorama,
      })
      sidecar.parallax = band.parallax ?? sidecar.parallax
      write(
        band.id,
        toIndexedImage(composed, bandPalette),
        `band ${index + 1} of ${name}, scale ${sidecar.scale ?? 1}`,
      )
    }
  } else if (sidecar.layer) {
    const small = await scaled(source, sidecar.scale ?? 1)
    const composed = composeLayer(quantize(small, 1), { ...sidecar.layer, ...panorama })
    write(id, toIndexedImage(composed, palette), `layer, scale ${sidecar.scale ?? 1}`)
  } else if (sidecar.scale || sidecar.sprites) {
    const names = sidecar.sprites ?? [id]
    const boxes = findSprites(source, { gap: sidecar.gap })
    if (boxes.length !== names.length) {
      throw new Error(
        `${name}: found ${boxes.length} object(s) but the sidecar names ${names.length}`,
      )
    }
    for (const [index, box] of boxes.entries()) {
      const region = new Uint8Array((box.right - box.left) * (box.bottom - box.top) * 4)
      for (let y = box.top; y < box.bottom; y += 1) {
        const from = (y * source.width + box.left) * 4
        region.set(
          source.data.subarray(from, from + (box.right - box.left) * 4),
          (y - box.top) * (box.right - box.left) * 4,
        )
      }
      const sprite = await scaled(
        { data: region, width: box.right - box.left, height: box.bottom - box.top },
        sidecar.scale ?? 1,
      )
      write(
        names[index],
        toIndexedImage(quantize(sprite, 1), palette),
        `sprite, scale ${sidecar.scale ?? 1}`,
      )
    }
  } else {
    const cell = sidecar.cell ?? detectGridSize(source)
    write(id, toIndexedImage(quantize(source, cell), palette), `grid ${cell}px`)
  }
}

manifest.layers.sort((a, b) => (a.parallax ?? 1) - (b.parallax ?? 1))
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
