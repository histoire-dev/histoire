import { describe, expect, it } from 'vitest'
import { captureProjectScreenshot } from '../api/capture.js'
import { mcpScreenshotResultSchema } from '../mcp/protocol/operation-schema.js'
import { mcpToolInputSchemas } from '../mcp/protocol/tool-schema.js'
import { CAPTURE_LIMITS } from '../runtime/browser/limits.js'
import { uiScreenshotSchema } from '../server/ui-channel/validation.js'

const target = { storyId: 'story', variantId: 'variant' }
const uiRequest = { requestId: 'capture', targets: [target], viewport: { width: 1, height: 1 }, scale: 1, format: 'png' as const, background: 'transparent' }
const mcpRequest = { ...target, requestKey: 'capture', width: 1, height: 1 }
const mcpResult = { ...target, width: 1, height: 1, mimeType: 'image/png' as const, bytes: 16, sha256: 'a'.repeat(64), artifactUri: '' }

describe('screenshot viewport bounds', () => {
  it('accepts a one-pixel viewport across UI, API and MCP contracts', async () => {
    expect(uiScreenshotSchema.parse(uiRequest).viewport).toEqual({ width: 1, height: 1 })
    expect(mcpToolInputSchemas.histoire_capture_screenshot.parse(mcpRequest)).toMatchObject({ width: 1, height: 1 })
    expect(mcpScreenshotResultSchema.parse(mcpResult)).toMatchObject({ width: 1, height: 1 })
    await expect(captureProjectScreenshot({} as Parameters<typeof captureProjectScreenshot>[0], targetWithSize(1, 1)))
      .rejects
      .toMatchObject({ code: 'CAPABILITY_UNAVAILABLE' })
  })

  it('rejects zero, negative, fractional and oversized dimensions in UI and MCP inputs', () => {
    for (const width of [0, -1, 1.5, CAPTURE_LIMITS.width + 1]) {
      expect(uiScreenshotSchema.safeParse({ ...uiRequest, viewport: { width, height: 1 } }).success).toBe(false)
      expect(mcpToolInputSchemas.histoire_capture_screenshot.safeParse({ ...mcpRequest, width }).success).toBe(false)
    }
    for (const height of [0, -1, 1.5, CAPTURE_LIMITS.height + 1]) {
      expect(uiScreenshotSchema.safeParse({ ...uiRequest, viewport: { width: 1, height } }).success).toBe(false)
      expect(mcpToolInputSchemas.histoire_capture_screenshot.safeParse({ ...mcpRequest, height }).success).toBe(false)
    }
  })

  it('rejects decoded MCP result dimensions outside positive device-pixel bounds', () => {
    const maxWidth = CAPTURE_LIMITS.width * CAPTURE_LIMITS.deviceScaleFactor
    const maxHeight = CAPTURE_LIMITS.height * CAPTURE_LIMITS.deviceScaleFactor
    for (const width of [0, -1, 1.5, maxWidth + 1]) {
      expect(mcpScreenshotResultSchema.safeParse({ ...mcpResult, width }).success).toBe(false)
    }
    for (const height of [0, -1, 1.5, maxHeight + 1]) {
      expect(mcpScreenshotResultSchema.safeParse({ ...mcpResult, height }).success).toBe(false)
    }
  })

  it('accepts small positive SDK dimensions and rejects invalid bounds before source lookup', async () => {
    await expect(captureProjectScreenshot({} as Parameters<typeof captureProjectScreenshot>[0], targetWithSize(128, 96)))
      .rejects
      .toMatchObject({ code: 'CAPABILITY_UNAVAILABLE' })
    for (const [width, height] of [[0, 96], [-1, 96], [1.5, 96], [CAPTURE_LIMITS.width + 1, 96], [128, 0], [128, -1], [128, 96.5], [128, CAPTURE_LIMITS.height + 1]]) {
      await expect(captureProjectScreenshot({} as Parameters<typeof captureProjectScreenshot>[0], targetWithSize(width, height)))
        .rejects
        .toMatchObject({ code: 'INVALID_ARGUMENT' })
    }
  })
})

/** Creates an exact SDK screenshot request for public-boundary checks. */
function targetWithSize(width: number, height: number) {
  return { ...target, width, height }
}
