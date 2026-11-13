// Validation behind `npm run art:check`: every shipped PNG must be a clean
// 8-bit indexed file, use only master palette colours, have 1-bit alpha, and
// match the size its manifest entry declares.

import { decodeIndices, parsePng } from './png.ts'

export type ManifestLayer = {
  id: string
  file: string
  width: number
  height: number
  status: 'placeholder' | 'final'
  parallax?: number
  provenance?: string
}

export type Manifest = {
  version: 1
  panorama: { width: number; height: number }
  layers: ManifestLayer[]
}

const allowedChunks = new Set(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND'])

const hex = ([r, g, b]: readonly [number, number, number]) =>
  '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)

export function checkPng(
  buffer: Buffer,
  {
    allowed,
    expected,
  }: { allowed: ReadonlySet<string>; expected?: { width: number; height: number } },
): string[] {
  const problems: string[] = []
  let png
  try {
    png = parsePng(buffer)
  } catch (error) {
    return [(error as Error).message]
  }
  if (png.colorType !== 3 || png.bitDepth !== 8 || png.interlace !== 0) {
    problems.push('must be 8-bit, non-interlaced, indexed colour')
    return problems
  }
  const extra = png.chunkTypes.filter((type) => !allowedChunks.has(type))
  if (extra.length) problems.push(`remove extra chunks: ${[...new Set(extra)].join(', ')}`)

  // A fully clear entry's colour is never shown, so it is exempt from the palette.
  const offPalette = png.palette
    .filter((_, index) => png.transparency[index] !== 0)
    .map(hex)
    .filter((color) => !allowed.has(color))
  if (offPalette.length) problems.push(`off-palette colours: ${offPalette.join(', ')}`)

  const partial = png.transparency.filter((alpha) => alpha !== 0 && alpha !== 255)
  if (partial.length) problems.push('partial alpha (only fully clear or fully opaque is allowed)')

  if (expected && (png.width !== expected.width || png.height !== expected.height)) {
    problems.push(
      `size ${png.width}x${png.height} does not match the manifest (${expected.width}x${expected.height})`,
    )
  }
  try {
    const indices = decodeIndices(png)
    if (indices.some((index) => index >= png.palette.length)) {
      problems.push('pixels reference colours outside the palette')
    }
  } catch (error) {
    problems.push((error as Error).message)
  }
  return problems
}

/** Cross-checks the manifest against the files found on disk. */
export function checkManifestFiles(manifest: Manifest, filesOnDisk: readonly string[]): string[] {
  const problems: string[] = []
  const listed = new Set(manifest.layers.map(({ file }) => file))
  for (const layer of manifest.layers) {
    if (!filesOnDisk.includes(layer.file)) problems.push(`${layer.file}: listed but missing`)
    if (layer.width > manifest.panorama.width || layer.height > manifest.panorama.height) {
      problems.push(`${layer.file}: larger than the panorama`)
    }
  }
  for (const file of filesOnDisk) {
    if (!listed.has(file)) problems.push(`${file}: not listed in the manifest`)
  }
  return problems
}
