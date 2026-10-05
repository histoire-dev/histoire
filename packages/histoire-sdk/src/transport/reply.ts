import type { HistoireBridgeRequest } from '@histoire/protocol'
import type { createInboundBridgeDispatch } from './inbound.js'
import type { BridgePortOptions } from './port.js'
import { HistoireSdkError, validateBridgeEnvelope } from '@histoire/protocol'

/** Replies and progress retain exact initiating owner even after frame navigation. */
export function createBridgeReplies(options: BridgePortOptions, inbound: ReturnType<typeof createInboundBridgeDispatch>, active: () => boolean, sequence: () => number) {
  const outward = options.child ? 'child-to-parent' : 'parent-to-child'
  return async (request: HistoireBridgeRequest): Promise<void> => {
    const { command: _command, payload: _payload, selectionRequestId: _selectionRequestId, ...captured } = request
    const tests = request.command === 'tests.run' || request.command === 'tests.collect'
    const engine = tests && options.child && ['data', 'primary'].includes(options.role)
    /** Bounded progress uses same source/document/target and unique request as result. */
    function progress(status: string, extra: Record<string, unknown> = {}) {
      if (!engine || !active()) return
      const { requestId, ...owner } = captured
      const event = { ...owner, kind: 'event', event: 'tests.progress', sequence: sequence(), payload: { runId: requestId, status, ...extra } }
      validateBridgeEnvelope(event, request, options.role, undefined, outward)
      options.port.postMessage(event)
    }
    let response: unknown
    try {
      progress(request.command === 'tests.collect' ? 'collecting' : 'running')
      let result = await inbound.run(request)
      // Only engine ports add attribution; view proxies preserve inner engine's
      // initiating request identity rather than inventing another run.
      if (engine) {
        const mode = request.command === 'tests.collect' ? 'preview' : (request.payload as { mode: 'preview' | 'server' }).mode
        result = { ...(result as object), execution: { runId: request.requestId, mode, sourceId: request.sourceId, epoch: request.epoch, revision: request.revision, target: request.target, ...(mode === 'preview' ? { runtimeId: request.runtimeId } : {}) } }
      }
      response = { ...captured, kind: 'response', ok: true, result: result ?? null }
      validateBridgeEnvelope(response, request, options.role, request.command, outward)
      // Progress has a smaller wire cap than result. Send bounded counts, never
      // duplicate potentially large assertion diagnostics into an event.
      const total = request.command === 'tests.run' ? (result as { total: number }).total : undefined
      progress('completed', total === undefined ? {} : { completed: total, total })
    }
    catch (error) {
      const failure = { code: error instanceof HistoireSdkError ? error.code : 'INTERNAL_ERROR', message: error instanceof HistoireSdkError ? error.message.slice(0, 2048) : 'Bridge operation failed' }
      response = { ...captured, kind: 'response', ok: false, error: failure }
      validateBridgeEnvelope(response, request, options.role, request.command, outward)
      progress(failure.code === 'CANCELLED' ? 'cancelled' : 'failed', { error: failure })
    }
    if (active()) options.port.postMessage(response)
  }
}
