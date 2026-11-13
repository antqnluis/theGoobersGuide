// A minimal indexed-PNG codec. Camp art is written as 8-bit palette PNGs with
// only the chunks a browser needs, so no gamma, colour profile, or text can
// shift colours between browsers and the runtime palette swap stays exact.

import { crc32, deflateSync, inflateSync } from 'node:zlib'

const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

export type IndexedImage = {
  width: number
  height: number
  /** Palette entries. When `transparent` is set, entry 0 is the clear colour. */
  palette: ReadonlyArray<readonly [number, number, number]>
  /** One palette index per pixel, row by row. */
  indices: Uint8Array
  transparent?: boolean
}

function chunk(type: string, data: Buffer) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, checksum])
}

export function encodeIndexedPng({
  width,
  height,
  palette,
  indices,
  transparent = false,
}: IndexedImage) {
  if (indices.length !== width * height) throw new Error('Pixel count does not match the size')
  if (palette.length === 0 || palette.length > 256)
    throw new Error('Palette must hold 1-256 colours')

  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bit depth
  header[9] = 3 // indexed colour
  const rows = Buffer.alloc((width + 1) * height)
  for (let y = 0; y < height; y += 1) {
    rows[y * (width + 1)] = 0 // filter: none
    Buffer.from(indices.buffer, indices.byteOffset + y * width, width).copy(
      rows,
      y * (width + 1) + 1,
    )
  }
  const chunks = [
    chunk('IHDR', header),
    chunk('PLTE', Buffer.from(palette.flatMap((color) => [...color]))),
  ]
  if (transparent) chunks.push(chunk('tRNS', Buffer.from([0])))
  chunks.push(chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0)))
  return Buffer.concat([signature, ...chunks])
}

export type ParsedPng = {
  width: number
  height: number
  bitDepth: number
  colorType: number
  interlace: number
  chunkTypes: string[]
  palette: Array<[number, number, number]>
  transparency: number[]
  idat: Buffer
}

export function parsePng(buffer: Buffer): ParsedPng {
  if (!buffer.subarray(0, 8).equals(signature)) throw new Error('Not a PNG file')
  const parsed: ParsedPng = {
    width: 0,
    height: 0,
    bitDepth: 0,
    colorType: -1,
    interlace: 0,
    chunkTypes: [],
    palette: [],
    transparency: [],
    idat: Buffer.alloc(0),
  }
  const idat: Buffer[] = []
  let offset = 8
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    const stored = buffer.readUInt32BE(offset + 8 + length)
    if (crc32(buffer.subarray(offset + 4, offset + 8 + length)) !== stored) {
      throw new Error(`Corrupt ${type} chunk`)
    }
    parsed.chunkTypes.push(type)
    if (type === 'IHDR') {
      parsed.width = data.readUInt32BE(0)
      parsed.height = data.readUInt32BE(4)
      parsed.bitDepth = data[8]
      parsed.colorType = data[9]
      parsed.interlace = data[12]
    } else if (type === 'PLTE') {
      for (let index = 0; index + 2 < data.length; index += 3) {
        parsed.palette.push([data[index], data[index + 1], data[index + 2]])
      }
    } else if (type === 'tRNS') {
      parsed.transparency = [...data]
    } else if (type === 'IDAT') {
      idat.push(data)
    }
    offset += 12 + length
  }
  parsed.idat = Buffer.concat(idat)
  return parsed
}

function paeth(left: number, up: number, upLeft: number) {
  const estimate = left + up - upLeft
  const distanceLeft = Math.abs(estimate - left)
  const distanceUp = Math.abs(estimate - up)
  const distanceUpLeft = Math.abs(estimate - upLeft)
  if (distanceLeft <= distanceUp && distanceLeft <= distanceUpLeft) return left
  return distanceUp <= distanceUpLeft ? up : upLeft
}

/** Palette indices of an 8-bit, non-interlaced indexed PNG, any filter type. */
export function decodeIndices(png: ParsedPng) {
  if (png.colorType !== 3 || png.bitDepth !== 8 || png.interlace !== 0) {
    throw new Error('Only 8-bit, non-interlaced indexed PNGs can be decoded')
  }
  const raw = inflateSync(png.idat)
  const stride = png.width
  const out = new Uint8Array(stride * png.height)
  for (let y = 0; y < png.height; y += 1) {
    const filter = raw[y * (stride + 1)]
    for (let x = 0; x < stride; x += 1) {
      const value = raw[y * (stride + 1) + 1 + x]
      const left = x > 0 ? out[y * stride + x - 1] : 0
      const up = y > 0 ? out[(y - 1) * stride + x] : 0
      const upLeft = x > 0 && y > 0 ? out[(y - 1) * stride + x - 1] : 0
      const predictor =
        filter === 0
          ? 0
          : filter === 1
            ? left
            : filter === 2
              ? up
              : filter === 3
                ? (left + up) >> 1
                : filter === 4
                  ? paeth(left, up, upLeft)
                  : NaN
      if (Number.isNaN(predictor)) throw new Error(`Unknown PNG filter ${filter}`)
      out[y * stride + x] = (value + predictor) & 255
    }
  }
  return out
}
