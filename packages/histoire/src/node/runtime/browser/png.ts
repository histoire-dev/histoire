import { Buffer } from 'node:buffer'
import { PreviewError } from './errors.js'

/** Validate complete PNG structure; dimensions are decoded device pixels. */
export function readPngDimensions(bytes: Uint8Array): { width: number, height: number } {
  const png = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (png.length < 45 || !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || png.readUInt32BE(8) !== 13 || png.toString('ascii', 12, 16) !== 'IHDR') {
    throw new PreviewError('INTERNAL_ERROR', 'Browser returned invalid PNG')
  }
  let offset = 8
  while (offset <= png.length - 12) {
    const length = png.readUInt32BE(offset)
    if (length > png.length - offset - 12) break
    const name = png.toString('ascii', offset + 4, offset + 8)
    offset += length + 12
    if (name === 'IEND' && length === 0 && offset === png.length) return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
  }
  throw new PreviewError('INTERNAL_ERROR', 'Browser returned incomplete PNG')
}
