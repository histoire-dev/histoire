import type { Page } from 'playwright'
import { Buffer } from 'node:buffer'
import { PreviewError } from './errors.js'
import { CAPTURE_LIMITS } from './limits.js'

/** Re-encode validated pixels in the existing browser session; never launch another. */
export async function encodeScreenshotWebp(page: Page, png: Uint8Array): Promise<Uint8Array> {
  const encoded = await page.evaluate(async (base64) => {
    const image = new Image()
    image.src = `data:image/png;base64,${base64}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Image encoder unavailable')
    context.drawImage(image, 0, 0)
    return canvas.toDataURL('image/webp', 1)
  }, Buffer.from(png).toString('base64'))
  if (!encoded.startsWith('data:image/webp;base64,')) throw new PreviewError('BROWSER_UNAVAILABLE', 'WebP encoder unavailable')
  const bytes = Buffer.from(encoded.slice('data:image/webp;base64,'.length), 'base64')
  if (!bytes.length || bytes.byteLength > CAPTURE_LIMITS.artifactBytes) throw new PreviewError('RESULT_TOO_LARGE', 'Screenshot exceeds 4 MiB limit')
  return bytes
}
