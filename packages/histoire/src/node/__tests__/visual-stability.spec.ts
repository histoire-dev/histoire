import { Buffer } from 'node:buffer'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { createScreenshotTask } from '../runtime/browser/screenshot.js'
import { createExecutionService } from '../runtime/execution-service.js'
import { createPreviewBrowserFixture } from './utils/mcp/preview-browser.js'

/** Pixels generated independently from capture code; encoding may differ. */
function image(changed: boolean, compression = 9) {
  const png = new PNG({ width: 480, height: 320 })
  png.data.fill(255)
  if (changed) png.data.set([0, 0, 0, 255], 0)
  return PNG.sync.write(png, { deflateLevel: compression })
}

describe('visual capture stability', () => {
  it('requires consecutive matching decoded pixels, leaving ordinary capture unchanged', async () => {
    const fixture = createPreviewBrowserFixture({ png: image(true) })
    // Browser-version observation is an external browser boundary.
    Object.assign(fixture.page, { context: () => ({ browser: () => ({ version: () => 'test-chromium' }) }) })
    fixture.screenshot.mockResolvedValueOnce(image(false)).mockResolvedValueOnce(image(true, 0))
    const execution = createExecutionService()
    try {
      const output = await execution.enqueue(createScreenshotTask({ ...fixture.session, stableCapture: true })).result
      expect(fixture.screenshot).toHaveBeenCalledTimes(3)
      expect(PNG.sync.read(Buffer.from(output.artifact)).data[0]).toBe(0)
      expect(output.result.browserVersion).toBe('test-chromium')
      const ordinary = createPreviewBrowserFixture({ png: image(false) })
      await execution.enqueue(createScreenshotTask(ordinary.session)).result
      expect(ordinary.screenshot).toHaveBeenCalledTimes(1)
    }
    finally {
      await execution.close()
    }
  })

  it('reports continually changing rendering as timeout and closes owned session', async () => {
    const fixture = createPreviewBrowserFixture()
    let changes = 0
    fixture.screenshot.mockImplementation(async () => {
      // Actual Chromium APIs yield to timers; preserve that external boundary.
      await new Promise(resolve => setTimeout(resolve, 5))
      return image(++changes % 2 === 0)
    })
    const execution = createExecutionService()
    try {
      await expect(execution.enqueue(createScreenshotTask({ ...fixture.session, stableCapture: true, timeoutMs: 40 })).result).rejects.toMatchObject({ code: 'TIMEOUT' })
      expect(fixture.close).toHaveBeenCalledOnce()
    }
    finally {
      await execution.close()
    }
  })
})
