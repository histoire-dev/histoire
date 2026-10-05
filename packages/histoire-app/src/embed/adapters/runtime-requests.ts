import type { HistoireRequestCapture } from '@histoire/sdk/internal'
import { HistoireSdkError } from '@histoire/protocol'

/** Pending sandbox calls belong to one document, never surviving iframe navigation. */
export function createRuntimeRequests(post: (message: Record<string, unknown>) => void, timeoutMs: number) {
  let next = 0
  const pending = new Map<string, { resolve: (value: any) => void, reject: (error: unknown) => void, clear: () => void }>()
  return {
    /** Existing sandbox protocol receives exact tuple/document instead of parsed variant keys. */
    request(type: string, payload: Record<string, unknown>, capture: HistoireRequestCapture): Promise<any> {
      const requestId = String(++next)
      return new Promise((resolve, reject) => {
        const abort = () => finish(new HistoireSdkError('CANCELLED', 'Runtime request cancelled'))
        const timer = setTimeout(() => finish(new HistoireSdkError('TIMEOUT', 'Runtime request timed out')), timeoutMs)
        /** Stop listeners before settling or rejecting captured work. */
        function finish(error?: unknown) {
          const entry = pending.get(requestId)
          if (!entry) return
          pending.delete(requestId)
          entry.clear()
          if (error) reject(error)
        }
        pending.set(requestId, { resolve, reject, clear: () => {
          clearTimeout(timer)
          capture.signal.removeEventListener('abort', abort)
        } })
        capture.signal.addEventListener('abort', abort, { once: true })
        if (capture.signal.aborted) abort()
        else post({ type, ...payload, requestId, runId: requestId, documentId: capture.runtimeId, ...capture.target })
      })
    },
    /** Frame/document/tuple validation happens before this correlated settlement. */
    receive(message: Record<string, any>) {
      const id = message.requestId ?? message.runId
      const entry = pending.get(id)
      if (!entry) return
      pending.delete(id)
      entry.clear()
      if (message.error) entry.reject(new HistoireSdkError(['COLLECTION_FAILED', 'INTERNAL_ERROR', 'RATE_LIMITED', 'INVALID_ARGUMENT', 'RESULT_TOO_LARGE', 'CAPABILITY_UNAVAILABLE', 'RUNTIME_CHANGED', 'PREVIEW_NOT_READY'].includes(message.error.code) ? message.error.code : 'SOURCE_UNAVAILABLE', message.error.message ?? 'Runtime operation failed'))
      else entry.resolve(Object.hasOwn(message, 'result') ? message.result : (message.summary !== undefined ? message.summary : { definitions: message.definitions ?? [], error: null }))
    },
    /** Observe/reject every old operation before publishing replacement readiness. */
    invalidate(code: 'RUNTIME_CHANGED' | 'PREVIEW_NOT_READY' = 'RUNTIME_CHANGED') {
      for (const entry of pending.values()) {
        entry.clear()
        entry.reject(new HistoireSdkError(code, 'Runtime owner changed'))
      }
      pending.clear()
    },
  }
}
