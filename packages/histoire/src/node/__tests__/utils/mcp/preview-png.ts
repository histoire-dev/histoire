import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'

/** Actual 480x320 Chromium output; unit tests do not need to launch a browser. */
export function readPreviewPng(): Buffer {
  return readFileSync(new URL('../../fixtures/mcp-preview/preview.png', import.meta.url))
}

/** Add a valid ancillary PNG text chunk to exercise inline threshold with real PNG. */
export function padPreviewPng(png: Buffer, bytes: number): Buffer {
  const text = Buffer.alloc(bytes, 32)
  text.write('padding\0')
  const typeAndText = Buffer.concat([Buffer.from('tEXt'), text])
  let crc = 0xFFFFFFFF
  for (const byte of typeAndText) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0)
  }
  const chunk = Buffer.alloc(text.length + 12)
  chunk.writeUInt32BE(text.length)
  typeAndText.copy(chunk, 4)
  chunk.writeUInt32BE((crc ^ 0xFFFFFFFF) >>> 0, chunk.length - 4)
  return Buffer.concat([png.subarray(0, png.length - 12), chunk, png.subarray(png.length - 12)])
}
