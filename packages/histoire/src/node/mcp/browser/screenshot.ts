import type { ExecutionTask } from '../../runtime/execution-types.js'
import type { McpOperationOutput } from '../operations/types.js'
import type { PreviewSessionOptions } from './session.js'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { McpDomainError } from '../protocol/errors.js'
import { MCP_LIMITS } from '../protocol/limits.js'
import { createPreviewSession } from './session.js'

/** Validate bounded PNG structure and original iframe dimensions. */
export function readPngDimensions(bytes: Uint8Array): { width: number, height: number } {
  const png = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (png.length < 45 || !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || png.readUInt32BE(8) !== 13 || png.toString('ascii', 12, 16) !== 'IHDR') {
    throw new McpDomainError('INTERNAL_ERROR', 'Browser returned invalid PNG')
  }
  let offset = 8
  while (offset <= png.length - 12) {
    const length = png.readUInt32BE(offset)
    if (length > png.length - offset - 12) break
    const name = png.toString('ascii', offset + 4, offset + 8)
    offset += length + 12
    if (name === 'IEND' && length === 0 && offset === png.length) return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
  }
  throw new McpDomainError('INTERNAL_ERROR', 'Browser returned incomplete PNG')
}

/** Factory acquires nothing; lane owns launch, capture and confirmed teardown. */
export function createScreenshotTask(options: PreviewSessionOptions): ExecutionTask<McpOperationOutput> {
  const session = createPreviewSession(options)
  return {
    async run(signal) {
      try {
        let ready = await session.open(signal)
        for (;;) {
          let artifact: Buffer
          try {
            artifact = await ready.page.locator('#histoire-mcp-preview').screenshot({ type: 'png', animations: 'disabled', timeout: session.remaining() })
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
          if (artifact.byteLength > MCP_LIMITS.artifactBytes) throw new McpDomainError('RESULT_TOO_LARGE', 'Screenshot exceeds 4 MiB limit')
          const dimensions = readPngDimensions(artifact)
          if (dimensions.width !== options.target.width || dimensions.height !== options.target.height) throw new McpDomainError('INTERNAL_ERROR', 'Screenshot dimensions do not match viewport')
          return { artifact, result: { storyId: options.target.storyId, variantId: options.target.variantId, ...dimensions, mimeType: 'image/png', bytes: artifact.byteLength, sha256: createHash('sha256').update(artifact).digest('hex'), artifactUri: '' } }
        }
      }
      catch (error) {
        if (session.timedOut) throw new McpDomainError('TIMEOUT', 'Screenshot exceeded its preview deadline', true)
        if (signal.aborted) throw new McpDomainError('CANCELLED', 'Screenshot operation cancelled')
        if (session.pageFailed) throw new McpDomainError('PREVIEW_NOT_READY', 'Preview page failed', true)
        if (error instanceof McpDomainError) throw error
        throw new McpDomainError('PREVIEW_NOT_READY', 'Screenshot could not be captured', true)
      }
    },
    cleanup: session.close,
  }
}
