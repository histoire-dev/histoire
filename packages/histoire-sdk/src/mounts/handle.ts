import type { HistoireRuntimeSnapshot } from '@histoire/protocol'
import type { HistoireBridgePort } from '../transport/port.js'
import { HistoireSdkError } from '@histoire/protocol'
/** Await actual document readiness with complete timer/observer/cancellation cleanup. */
export function waitBridgeRuntime(bridge: HistoireBridgePort, signal: AbortSignal, timeout: number): Promise<HistoireRuntimeSnapshot> {
  const promise = new Promise<HistoireRuntimeSnapshot>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>
    let off = () => {
    }
    /** Release every waiter before settling or aborting. */
    function cleanup(): void {
      clearTimeout(timer)
      off()
      signal.removeEventListener('abort', abort)
    }
    /** Unmount and disposal cancel before any late runtime publication. */
    function abort(): void {
      cleanup()
      reject(new HistoireSdkError('RUNTIME_CHANGED', 'Surface detached'))
    }
    off = bridge.subscribe((value) => {
      if (value.type !== 'runtime') {
        return
      }
      if (value.runtime.status === 'ready') {
        cleanup()
        resolve(value.runtime)
      }
      else if (value.runtime.status === 'failed' || value.runtime.status === 'stale') {
        cleanup()
        reject(new HistoireSdkError('PREVIEW_NOT_READY', 'Runtime unavailable'))
      }
    })
    timer = setTimeout(() => {
      cleanup()
      reject(new HistoireSdkError('TIMEOUT', 'Runtime readiness timed out'))
    }, timeout)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) {
      abort()
    }
  })
  void promise.catch(() => {
  })
  return promise
}
