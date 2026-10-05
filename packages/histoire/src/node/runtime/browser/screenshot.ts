import type { ExecutionTask } from '../execution-types.js'
import type { PreviewSessionOptions } from './session.js'
import type { ScreenshotFileOutput, ScreenshotOutput } from './types.js'
import { createHash } from 'node:crypto'
import { PreviewError } from './errors.js'
import { CAPTURE_LIMITS } from './limits.js'
import { readPngDimensions } from './png.js'
import { createPreviewSession } from './session.js'
import { encodeScreenshotWebp } from './webp.js'

export { readPngDimensions } from './png.js'

/** Factory acquires nothing; lane owns launch, capture and confirmed teardown. */
export function createScreenshotTask(options: PreviewSessionOptions): ExecutionTask<ScreenshotOutput>
/** Optional UI image encoding uses the same lane and preview session as MCP. */
export function createScreenshotTask(options: PreviewSessionOptions, encoding: { format: 'png' | 'webp' }): ExecutionTask<ScreenshotFileOutput>
/** Factory acquires nothing; default PNG output remains the MCP contract. */
export function createScreenshotTask(options: PreviewSessionOptions, encoding: { format: 'png' | 'webp' } = { format: 'png' }): ExecutionTask<ScreenshotFileOutput> {
  // Queueing captures target scalars/globals, never a caller's mutable options.
  options = { ...options, target: { ...options.target, globals: options.target.globals && { ...options.target.globals }, propsOverride: options.target.propsOverride && structuredClone(options.target.propsOverride) } }
  const session = createPreviewSession({ ...options, deterministicCapture: true })
  return {
    async run(signal) {
      try {
        let ready = await session.open(signal)
        for (;;) {
          let artifact: Uint8Array
          try {
            artifact = await ready.page.locator('#histoire-mcp-preview').screenshot({ type: 'png', animations: 'disabled', scale: 'device', omitBackground: options.target.backgroundColor === 'transparent', timeout: session.remaining() })
          }
          catch (error) {
            if (await session.isDocumentReady(ready.documentId)) throw error
            ready = await session.waitForReady()
            continue
          }
          // A cold Vite optimizer may reload the iframe during capture. Never
          // retain pixels from a document whose readiness authority was lost.
          if (!await session.isDocumentReady(ready.documentId)) {
            ready = await session.waitForReady()
            continue
          }
          if (artifact.byteLength > CAPTURE_LIMITS.artifactBytes) throw new PreviewError('RESULT_TOO_LARGE', 'Screenshot exceeds 4 MiB limit')
          const dimensions = readPngDimensions(artifact)
          const scale = options.target.deviceScaleFactor ?? 1
          if (dimensions.width !== options.target.width * scale || dimensions.height !== options.target.height * scale) throw new PreviewError('INTERNAL_ERROR', 'Screenshot dimensions do not match viewport and device scale')
          if (encoding.format === 'webp') artifact = await encodeScreenshotWebp(ready.page, artifact)
          return { artifact, result: { storyId: options.target.storyId, variantId: options.target.variantId, ...dimensions, mimeType: encoding.format === 'webp' ? 'image/webp' : 'image/png', bytes: artifact.byteLength, sha256: createHash('sha256').update(artifact).digest('hex') } }
        }
      }
      catch (error) {
        if (session.timedOut) throw new PreviewError('TIMEOUT', 'Screenshot exceeded its preview deadline', true)
        if (signal.aborted) throw new PreviewError('CANCELLED', 'Screenshot operation cancelled')
        if (session.pageFailed) throw new PreviewError('PREVIEW_NOT_READY', 'Preview page failed', true)
        if (error instanceof PreviewError) throw error
        throw new PreviewError('PREVIEW_NOT_READY', 'Screenshot could not be captured', true)
      }
    },
    cleanup: session.close,
  }
}
