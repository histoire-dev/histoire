import type { Buffer } from 'node:buffer'
import type { Page } from 'playwright'
import { describe, expect, it } from 'vitest'
import { createTailwindBook } from '../../utils/tailwind-browser.js'

/** Decode retained PNG bytes in browser to test exported transparency, not CSS. */
async function cornerPixel(page: Page, png: Buffer) {
  return page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), value => value.charCodeAt(0))
    const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')!
    context.drawImage(image, 0, 0)
    const pixel = [...context.getImageData(image.width - 4, image.height - 4, 1, 1).data]
    image.close()
    return pixel
  }, png.toString('base64'))
}

describe('tailwind canvas backgrounds', () => {
  it.each([['dev', 3], ['static', 3], ['dev', 4], ['static', 4]] as const)('retains transparent space and opaque token samples in %s Tailwind v%i', async (mode, version) => {
    const fixture = await createTailwindBook(version, mode)
    const page = await fixture.browser.newPage({ viewport: { width: 1400, height: 1000 } })
    const capture = await fixture.browser.newPage({ viewport: { width: 640, height: 480 } })
    try {
      const story = fixture.catalog.stories.find(story => version === 3 ? story.id === 'tailwind' : story.title.includes('main.css'))!
      await page.goto(`${fixture.bookUrl}#/story/${encodeURIComponent(story.id)}?variantId=background-color`)
      const token = version === 3 ? 'ac-bg-brand' : 'bg-brand'
      const runtime = () => page.frames().find(frame => frame.url().includes('__sandbox.html') && new URL(frame.url()).searchParams.get('storyId') === story.id && new URL(frame.url()).searchParams.get('controls') !== 'true')!
      await expect.poll(() => runtime()?.locator(`[data-tailwind-value="${token}"]`).count(), { timeout: 15_000 }).toBe(1)
      // Isolate the story document: an iframe screenshot also includes its opaque canvas backing.
      await capture.goto(runtime().url())
      await capture.locator(`[data-tailwind-value="${token}"]`).waitFor()
      for (const palette of ['Light checkerboard', 'Dark checkerboard']) {
        await page.getByRole('button', { name: 'Background', exact: true }).click()
        await page.getByRole('button', { name: palette, exact: true }).click()
        await page.keyboard.press('Escape')
        const space = await capture.locator('.histoire-tailwind-book').screenshot({ omitBackground: true })
        expect((await cornerPixel(page, space))[3]).toBe(0)
        const sample = await capture.locator(`[data-tailwind-value="${token}"]`).screenshot({ omitBackground: true })
        expect(await cornerPixel(page, sample)).toEqual([18, 52, 86, 255])
      }
    }
    finally {
      await page.close()
      await capture.close()
      await fixture.close()
    }
  })
})
