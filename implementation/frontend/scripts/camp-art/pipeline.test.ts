import { crc32 } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  masterBiome,
  masterColors,
  masterFixed,
} from '../../src/features/campaigns/camp/masterPalette.ts'
import { hexToRgb } from '../../src/features/campaigns/camp/oklab.ts'
import { checkManifestFiles, checkPng, type Manifest } from './checkArt.ts'
import { decodeIndices, encodeIndexedPng, parsePng } from './png.ts'
import { detectGridSize, quantizeToGrid, toIndexedImage } from './quantize.ts'

const allowed = new Set(masterColors())
const palette = masterColors().map(hexToRgb)

/** A source image upscaled by `cell`, with optional per-channel noise. */
function gridded(pattern: number[][], cell: number, colors: string[], noise = 0) {
  const height = pattern.length * cell
  const width = pattern[0].length * cell
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = pattern[Math.floor(y / cell)][Math.floor(x / cell)]
      const at = (y * width + x) * 4
      if (index < 0) {
        data.set([255, 0, 255, 255], at) // magenta background key
        continue
      }
      const [r, g, b] = hexToRgb(colors[index])
      const jitter = noise ? ((x * 7 + y * 13) % (noise * 2 + 1)) - noise : 0
      data.set([r + jitter, g + jitter, b + jitter, 255], at)
    }
  }
  return { data, width, height }
}

/** Inserts a chunk straight after IHDR, with a valid checksum. */
function withChunk(png: Buffer, type: string, data: number[]) {
  const body = Buffer.concat([Buffer.from(type), Buffer.from(data)])
  const chunk = Buffer.alloc(12 + data.length)
  chunk.writeUInt32BE(data.length, 0)
  body.copy(chunk, 4)
  chunk.writeUInt32BE(crc32(body), 8 + data.length)
  const afterHeader = 8 + 25
  return Buffer.concat([png.subarray(0, afterHeader), chunk, png.subarray(afterHeader)])
}

describe('png codec', () => {
  it('round-trips indices, palette, and transparency', () => {
    const image = {
      width: 3,
      height: 2,
      palette: [
        [0, 0, 0],
        [10, 20, 30],
        [200, 100, 50],
      ] as const,
      indices: new Uint8Array([0, 1, 2, 2, 1, 0]),
      transparent: true,
    }
    const parsed = parsePng(encodeIndexedPng(image))
    expect(parsed.chunkTypes).toEqual(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND'])
    expect(parsed.palette).toEqual(image.palette.map((color) => [...color]))
    expect(parsed.transparency).toEqual([0])
    expect([...decodeIndices(parsed)]).toEqual([...image.indices])
  })

  it('is deterministic', () => {
    const image = { width: 2, height: 2, palette: [[1, 2, 3]] as const, indices: new Uint8Array(4) }
    expect(encodeIndexedPng(image).equals(encodeIndexedPng(image))).toBe(true)
  })

  it('rejects corrupt data', () => {
    const png = encodeIndexedPng({
      width: 1,
      height: 1,
      palette: [[1, 2, 3]],
      indices: new Uint8Array(1),
    })
    png[png.length - 20] ^= 0xff
    expect(() => parsePng(png)).toThrow(/Corrupt/)
  })
})

describe('grid detection and quantizing', () => {
  const colors = [masterBiome.ground[1], masterBiome.rock[2], masterFixed.fire[2]]
  const pattern = [
    [0, 1, 0, 2, 2, 0],
    [1, 1, 2, 0, 0, 1],
    [0, 2, 2, 1, 0, 0],
    [2, 0, 1, 1, 1, 2],
  ]

  it.each([4, 6, 8])('finds a %ipx grid', (cell) => {
    expect(detectGridSize(gridded(pattern, cell, colors))).toBe(cell)
  })

  it('returns 1 for a flat image', () => {
    expect(
      detectGridSize(
        gridded(
          [
            [0, 0],
            [0, 0],
          ],
          8,
          colors,
        ),
      ),
    ).toBe(1)
  })

  it('takes the most common on-palette colour per cell, even with noise', () => {
    const result = quantizeToGrid(gridded(pattern, 6, colors, 3), { palette, cell: 6 })
    expect(result.width).toBe(6)
    expect(result.height).toBe(4)
    const expected = pattern
      .flat()
      .map((index) => palette.findIndex((c) => c.join() === hexToRgb(colors[index]).join()))
    expect([...result.indices]).toEqual(expected)
  })

  it('clears keyed background cells to transparent', () => {
    const withKey = [
      [0, -1],
      [-1, 1],
    ]
    const result = quantizeToGrid(gridded(withKey, 4, colors), {
      palette,
      cell: 4,
      key: [255, 0, 255],
    })
    expect([...result.indices].map((index) => index < 0)).toEqual([false, true, true, false])
  })

  it('writes only palette colours, with the clear colour first', () => {
    const quantized = quantizeToGrid(
      gridded(
        [
          [0, -1],
          [1, 0],
        ],
        4,
        colors,
      ),
      {
        palette,
        cell: 4,
        key: [255, 0, 255],
      },
    )
    const png = encodeIndexedPng(toIndexedImage(quantized, palette))
    expect(checkPng(png, { allowed, expected: { width: 2, height: 2 } })).toEqual([])
  })
})

describe('art:check rules', () => {
  const base = {
    width: 2,
    height: 1,
    palette: [[0, 0, 0], hexToRgb(masterBiome.sky[0])] as const,
    indices: new Uint8Array([0, 1]),
    transparent: true,
  }

  it('passes a clean on-palette file', () => {
    expect(
      checkPng(encodeIndexedPng(base), { allowed, expected: { width: 2, height: 1 } }),
    ).toEqual([])
  })

  it('flags off-palette colours', () => {
    const png = encodeIndexedPng({
      ...base,
      palette: [
        [0, 0, 0],
        [1, 2, 3],
      ],
    })
    expect(checkPng(png, { allowed }).join()).toMatch(/off-palette colours: #010203/)
  })

  it('flags a size that disagrees with the manifest', () => {
    expect(
      checkPng(encodeIndexedPng(base), { allowed, expected: { width: 4, height: 4 } }).join(),
    ).toMatch(/does not match the manifest/)
  })

  it('flags extra chunks such as gamma', () => {
    const png = withChunk(encodeIndexedPng(base), 'gAMA', [0, 1, 0x86, 0xa0])
    expect(checkPng(png, { allowed }).join()).toMatch(/extra chunks: gAMA/)
  })

  it('flags partial alpha', () => {
    const opaque = encodeIndexedPng({ ...base, transparent: false })
    const png = withChunk(opaque, 'tRNS', [128, 255])
    expect(checkPng(png, { allowed }).join()).toMatch(/partial alpha/)
  })

  it('cross-checks the manifest against the files on disk', () => {
    const manifest: Manifest = {
      version: 1,
      panorama: { width: 960, height: 270 },
      layers: [
        { id: 'a', file: 'a.png', width: 960, height: 270, status: 'final' },
        { id: 'b', file: 'b.png', width: 2000, height: 270, status: 'placeholder' },
      ],
    }
    const problems = checkManifestFiles(manifest, ['a.png', 'stray.png'])
    expect(problems).toEqual([
      'b.png: listed but missing',
      'b.png: larger than the panorama',
      'stray.png: not listed in the manifest',
    ])
  })
})
