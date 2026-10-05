import type { Page } from 'playwright'
import { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'
import { encodeScreenshotWebp } from '../runtime/browser/webp.js'
import { PREVIEW_PNG } from './utils/mcp/preview-browser.js'

describe('shared browser WebP encoding', () => {
  it('encodes already validated PNG bytes through existing session page', async () => {
    const bytes = Buffer.from('RIFFwebp')
    const evaluate = vi.fn(async () => `data:image/webp;base64,${bytes.toString('base64')}`)
    expect(await encodeScreenshotWebp({ evaluate } as unknown as Page, PREVIEW_PNG)).toEqual(bytes)
    expect(evaluate).toHaveBeenCalledWith(expect.any(Function), Buffer.from(PREVIEW_PNG).toString('base64'))
  })

  it('rejects browser fallback PNG instead of writing incorrect .webp bytes', async () => {
    const evaluate = vi.fn(async () => `data:image/png;base64,${Buffer.from(PREVIEW_PNG).toString('base64')}`)
    await expect(encodeScreenshotWebp({ evaluate } as unknown as Page, PREVIEW_PNG)).rejects.toMatchObject({ code: 'BROWSER_UNAVAILABLE' })
  })
})
