import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

/** Actual 480x320 Chromium output; unit tests do not need to launch a browser. */
export function readPreviewPng(): Buffer {
  return readFileSync(new URL('../../fixtures/mcp-preview/preview.png', import.meta.url))
}

/** Add a valid ancillary PNG text chunk to exercise inline threshold with real PNG. */
export function padPreviewPng(png: Buffer, bytes: number): Buffer {
  const text = Buffer.alloc(bytes, 32)
  text.write('padding\0')
  const chunk = pngChunk('tEXt', text)
  return Buffer.concat([png.subarray(0, png.length - 12), chunk, png.subarray(png.length - 12)])
}

/** Complete CRC-bearing PNG chunk shared by dimension and byte-limit fixtures. */
function pngChunk(type: string, data: Buffer): Buffer {
  const typeAndText = Buffer.concat([Buffer.from(type), data])
  let crc = 0xFFFFFFFF
  for (const byte of typeAndText) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0)
  }
  const chunk = Buffer.alloc(data.length + 12)
  chunk.writeUInt32BE(data.length)
  typeAndText.copy(chunk, 4)
  chunk.writeUInt32BE((crc ^ 0xFFFFFFFF) >>> 0, chunk.length - 4)
  return chunk
}

/** Low-entropy valid one-bit grayscale PNG for scaled pixel bounds and retention. */
export function createPreviewPng(width: number, height: number): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 1
  const rows = Buffer.alloc((Math.ceil(width / 8) + 1) * height)
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(rows)), pngChunk('IEND', Buffer.alloc(0))])
}
