import type { HistoireBridgeCommand, HistoireBridgeIdentity, HistoireBridgeResponse } from '@histoire/protocol'
import { HistoireSdkError } from '@histoire/protocol'
/** One pending operation, bound to exact captured owner and command. */
export interface BridgePending {
  /** Exact allocated intent, distinct from its desired target and predecessor owner. */
  requestId: string
  /** Captured command supplies successful-result validator. */
  command: HistoireBridgeCommand
  /** Captured source/document/target identity. */
  owner: HistoireBridgeIdentity
  /** Finite metadata/presentation work survives document teardown within same source. */
  source: boolean
  /** Complete settlement and cancellation cleanup. */
  settle: (value: {
    result: unknown
  } | {
    error: unknown
  }) => void
}
/** Correlation registry never retries or reuses request identities. */
export function createBridgeRequests() {
  const pending = new Map<string, BridgePending>()
  let next = 0
  return {
    /** Lookup happens before untrusted successful-result validation. */
    get: (id: string) => pending.get(id),
    /** Allocate and observe one pending request before posting. */
    add(command: HistoireBridgeCommand, owner: HistoireBridgeIdentity, signal: AbortSignal, timeout: number, cancel?: (id: string) => void, source = false) {
      const id = `${owner.connectionId}:request:${++next}`
      let item: BridgePending
      const promise = new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => item.settle({ error: new HistoireSdkError('TIMEOUT', `${command} timed out`) }), timeout)
        const abort = () => item.settle({ error: signal.reason ?? new HistoireSdkError('CANCELLED', 'Request cancelled') })
        item = {
          requestId: id,
          command,
          owner,
          source,
          settle(value) {
            if (!pending.delete(id)) {
              return
            }
            clearTimeout(timer)
            signal.removeEventListener('abort', abort)
            if ('error' in value) {
              try {
                cancel?.(id)
              }
              catch { /* Failed cancellation cannot prevent local settlement. */ }
              reject(value.error)
            }
            else {
              resolve(value.result)
            }
          },
        }
        pending.set(id, item)
        signal.addEventListener('abort', abort, { once: true })
        if (signal.aborted) {
          abort()
        }
      })
      void promise.catch(() => {
      })
      return { id, promise }
    },
    /** Settle exactly once after complete response validation. */
    receive(response: HistoireBridgeResponse) {
      pending.get(response.requestId)?.settle(response.ok ? { result: response.result } : { error: new HistoireSdkError(response.error.code, response.error.message, response.error.details) })
    },
    /** Reject affected work before closing/replacing any resource. */
    reject(error: unknown, predicate: (item: BridgePending) => boolean = () => true) {
      for (const item of pending.values()) {
        if (predicate(item)) {
          item.settle({ error })
        }
      }
    },
  }
}
