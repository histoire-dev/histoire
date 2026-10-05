import type { UiChannelError, UiScreenshotRequest, UiScreenshotResult } from '@histoire/shared'
import type { PreviewSessionOptions } from '../../runtime/browser/session.js'
import type { ExecutionService } from '../../runtime/execution-service.js'
import type { ExecutionHandle } from '../../runtime/execution-types.js'
import { PreviewError } from '../../runtime/browser/errors.js'
import { createScreenshotTask } from '../../runtime/browser/screenshot.js'
import { drainExecutionHandles } from '../../runtime/execution-owner.js'
import { ExecutionError } from '../../runtime/execution-types.js'
import { saveScreenshotFile } from './files.js'

/** Keep host failures deliberate and avoid leaking filesystem paths or credentials. */
export function screenshotError(error: unknown): UiChannelError {
  if (error instanceof PreviewError) {
    if (['DEPENDENCY_MISSING', 'BROWSER_UNAVAILABLE'].includes(error.code)) return { code: 'unavailable', message: 'Install Playwright in this project: pnpm add -D playwright && pnpm exec playwright install chromium' }
    if (error.code === 'TIMEOUT') return { code: 'timeout', message: 'Screenshot timed out' }
    if (error.code === 'CANCELLED') return { code: 'cancelled', message: 'Capture cancelled' }
  }
  if (error instanceof ExecutionError) {
    if (error.code === 'CANCELLED') return { code: 'cancelled', message: 'Capture cancelled' }
    if (error.code === 'UNAVAILABLE' || error.code === 'QUEUE_FULL') return { code: 'unavailable', message: error.message }
  }
  return { code: 'failed', message: 'Screenshot could not be captured' }
}

/** Browser identity scopes request cancellation; handles never cross request owners. */
interface CaptureRequest {
  /** Originating socket. */
  owner: object
  /** Browser correlation identity. */
  id: string
  /** Cancellation prevents admitting later targets. */
  cancelled: boolean
  /** Only this request's queued or active lane job. */
  handle?: ExecutionHandle<unknown>
}

/** UI owns file delivery while runtime owns the exact shared browser capture task. */
export function createUiScreenshotService(options: {
  /** Real project root. */
  root: string
  /** Shared MCP/UI lane. */
  execution: ExecutionService
  /** Resolve catalog authority synchronously before each enqueue. */
  resolve: (request: UiScreenshotRequest, target: UiScreenshotRequest['targets'][number]) => PreviewSessionOptions
}) {
  const requests = new Set<CaptureRequest>()
  let closed = false
  return {
    /** One target per lane job; partial failure keeps all successfully written files. */
    async capture(input: UiScreenshotRequest, owner: object): Promise<UiScreenshotResult> {
      if (closed) return { requestId: input.requestId, error: { code: 'unavailable', message: 'Capture service unavailable' } }
      if ([...requests].some(request => request.owner === owner && request.id === input.requestId)) return { requestId: input.requestId, error: { code: 'invalid', message: 'Capture request already exists' } }
      input = { ...input, targets: input.targets.map(target => ({ ...target, ...(target.propsOverride ? { propsOverride: structuredClone(target.propsOverride) } : {}) })) }
      const request: CaptureRequest = { owner, id: input.requestId, cancelled: false }
      requests.add(request)
      const files: Extract<UiScreenshotResult, { files: unknown }>['files'] = []
      const errors: NonNullable<Extract<UiScreenshotResult, { files: unknown }>['errors']> = []
      try {
        for (const target of input.targets) {
          if (request.cancelled) break
          try {
            const session = options.resolve(input, target)
            const task = createScreenshotTask(session, { format: input.format })
            const handle = options.execution.enqueue(task)
            request.handle = handle
            const output = await handle.result
            if (request.cancelled) break
            if (!session.target.isActive()) throw new ExecutionError('CANCELLED', 'Capture generation retired')
            files.push(await saveScreenshotFile(options.root, target, input.format, output.artifact))
          }
          catch (error) { errors.push({ storyId: target.storyId, variantId: target.variantId, ...(target.frameKey ? { frameKey: target.frameKey } : {}), error: screenshotError(error) }) }
          finally { request.handle = undefined }
        }
        if (request.cancelled) return files.length ? { requestId: input.requestId, files, errors: [...errors, ...input.targets.slice(files.length + errors.length).map(target => ({ storyId: target.storyId, variantId: target.variantId, ...(target.frameKey ? { frameKey: target.frameKey } : {}), error: { code: 'cancelled' as const, message: 'Capture cancelled' } }))] } : { requestId: input.requestId, error: { code: 'cancelled', message: 'Capture cancelled' } }
        return files.length ? { requestId: input.requestId, files, ...(errors.length ? { errors } : {}) } : { requestId: input.requestId, error: errors[0]?.error ?? { code: 'failed', message: 'Screenshot could not be captured' } }
      }
      finally { requests.delete(request) }
    },
    /** Cancellation never touches another browser or MCP execution. */
    cancel(requestId: string, owner: object) {
      for (const request of requests) {
        if (request.id !== requestId || request.owner !== owner) continue
        request.cancelled = true
        request.handle?.cancel()
      }
    },
    /** Drain owned resources before the generation retires its preview host. */
    async close() {
      closed = true
      for (const request of requests) request.cancelled = true
      await drainExecutionHandles(options.execution, [...requests].flatMap(request => request.handle ? [request.handle] : []))
    },
  }
}
