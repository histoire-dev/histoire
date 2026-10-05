import type { HistoireErrorCode } from '@histoire/protocol'
import { HistoireSdkError } from '@histoire/protocol'

/** Observe public async wrappers as well as underlying owned transport work. */
export function observeOperation<T>(promise: Promise<T>): Promise<T> {
  void promise.catch(() => {})
  return promise
}

/** Request invalidation scope; runtime work does not cancel unrelated docs reads. */
export interface OperationScope {
  /** Owning operation category. */
  kind: 'connect' | 'source' | 'runtime' | 'selection' | 'mount'
  /** Exact surface when operation belongs to an attachment. */
  mountId?: string
}

/** Pending work rejected synchronously before async resource cleanup. */
interface PendingOperation extends OperationScope {
  /** Immediately settles consumer and aborts supported adapter work. */
  cancel: (error: HistoireSdkError) => void
}

/** Per-session registry; late adapter promises stay observed after invalidation. */
export class OperationOwner {
  /** Currently attributable unsettled work. */
  private readonly pending = new Set<PendingOperation>()

  /** Tracks one operation and observes all late success/failure paths. */
  run<T>(scope: OperationScope, task: (signal: AbortSignal) => Promise<T>, guard: () => void, signal?: AbortSignal): Promise<T> {
    const abort = new AbortController()
    let cleanup = () => {}
    const promise = new Promise<T>((resolve, reject) => {
      let settled = false
      const finish = (complete: () => void) => {
        if (settled) return
        settled = true
        cleanup()
        complete()
      }
      const operation: PendingOperation = {
        ...scope,
        cancel: error => finish(() => {
          abort.abort(error)
          reject(error)
        }),
      }
      const onAbort = () => operation.cancel(new HistoireSdkError('CANCELLED', 'Operation cancelled.'))
      cleanup = () => {
        this.pending.delete(operation)
        signal?.removeEventListener('abort', onAbort)
      }
      this.pending.add(operation)
      if (signal?.aborted) {
        onAbort()
        return
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      Promise.resolve().then(() => {
        guard()
        if (abort.signal.aborted) throw abort.signal.reason
        return task(abort.signal)
      }).then(
        value => finish(() => {
          try {
            guard()
            resolve(value)
          }
          catch (error) { reject(error) }
        }),
        error => finish(() => reject(error)),
      )
    })
    // Callers may abandon ready/connect/request promises; teardown still owns them.
    void promise.catch(() => {})
    return promise
  }

  /** Invalidates matching work without waiting for uncooperative user code. */
  reject(code: HistoireErrorCode, message: string, matches: (scope: OperationScope) => boolean = () => true): void {
    const error = new HistoireSdkError(code, message)
    for (const operation of [...this.pending]) {
      if (matches(operation)) operation.cancel(error)
    }
  }
}
