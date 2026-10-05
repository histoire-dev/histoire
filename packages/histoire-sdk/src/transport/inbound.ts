import type { HistoireBridgeIdentity, HistoireBridgeRequest } from '@histoire/protocol'
import { HistoireSdkError } from '@histoire/protocol'

/** Inbound test execution owns one abort controller per exact transferred-port request. */
export function createInboundBridgeDispatch(dispatch: ((request: HistoireBridgeRequest, signal: AbortSignal) => unknown | Promise<unknown>) | undefined) {
  const active = new Map<string, { request: HistoireBridgeRequest, abort: AbortController }>()
  const lifetime = new AbortController()
  /** Captured metadata equality prevents cancelling another document or target on this port. */
  function sameOwner(left: HistoireBridgeIdentity, right: HistoireBridgeIdentity) {
    return ['protocolVersion', 'sessionId', 'connectionId', 'mountId', 'sourceId', 'epoch', 'revision', 'runtimeId', 'selectionVersion'].every(key => left[key as keyof HistoireBridgeIdentity] === right[key as keyof HistoireBridgeIdentity])
      && left.target?.storyId === right.target?.storyId && left.target?.variantId === right.target?.variantId
  }
  return {
    /** Source execution outlives runtime; validate its cancellation against captured owner. */
    sourceCancellationOwner(input: { kind?: unknown, command?: unknown, payload?: unknown }): HistoireBridgeIdentity | undefined {
      if (input.kind !== 'request' || input.command !== 'tests.cancel' || !input.payload || typeof input.payload !== 'object') return
      const requestId = (input.payload as { requestId?: unknown }).requestId
      const entry = typeof requestId === 'string' ? active.get(requestId) : undefined
      if (entry?.request.command === 'tests.run' && (entry.request.payload as { mode: string }).mode === 'server') return entry.request
    },
    /** Ack retires publication; dispatch stays observed until actual cleanup. */
    async run(request: HistoireBridgeRequest): Promise<unknown> {
      if (request.command === 'tests.cancel') {
        const requestId = (request.payload as { requestId: string }).requestId
        const entry = active.get(requestId)
        if (!entry || !sameOwner(entry.request, request)) throw new HistoireSdkError('INVALID_ARGUMENT', 'No matching test request on this port')
        entry.abort.abort(new HistoireSdkError('CANCELLED', 'Test request cancelled'))
        return { requestId, cancelled: true }
      }
      if (!['tests.run', 'tests.collect'].includes(request.command)) return dispatch?.(request, lifetime.signal)
      if (active.has(request.requestId)) throw new HistoireSdkError('INVALID_ARGUMENT', 'Duplicate test request identity')
      const abort = new AbortController()
      active.set(request.requestId, { request, abort })
      const signal = AbortSignal.any([abort.signal, lifetime.signal])
      try {
        const result = await dispatch?.(request, signal)
        signal.throwIfAborted()
        return result
      }
      finally { active.delete(request.requestId) }
    },
    /** Frame teardown cancels only this port's work; cleanup remains observed. */
    close() { lifetime.abort(new HistoireSdkError('NOT_CONNECTED', 'Port closed')) },
  }
}
