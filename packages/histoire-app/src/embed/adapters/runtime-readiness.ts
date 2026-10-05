import type { HistoireRuntimeSnapshot } from '@histoire/protocol'
import { HistoireSdkError } from '@histoire/protocol'

/** Each selected actor owns its readiness promise and deadline, including reused documents. */
export function createRuntimeReadiness(timeout: number, failed: (error: HistoireSdkError) => void) {
  let resolve: (runtime: HistoireRuntimeSnapshot) => void
  let reject: (error: unknown) => void
  let promise: Promise<HistoireRuntimeSnapshot>
  let timer: ReturnType<typeof setTimeout> | undefined
  let settled = true

  /** Retired actor cannot settle later or time out against successor. */
  function retire(message: string) {
    clearTimeout(timer)
    timer = undefined
    settled = true
    reject?.(new HistoireSdkError('RUNTIME_CHANGED', message))
  }

  return {
    retire,
    /** Reserve before requesting selection, so synchronously published replies are owned. */
    reset(retainPending = false) {
      if (!retainPending || settled) {
        retire('Runtime selection replaced')
        settled = false
        promise = new Promise((accept, deny) => {
          resolve = accept
          reject = deny
        })
        void promise.catch(() => {})
      }
      clearTimeout(timer)
      timer = setTimeout(() => failed(new HistoireSdkError('PREVIEW_NOT_READY', 'Story runtime did not mount in time')), timeout)
    },
    /** Current actor readiness; never captured by another selection. */
    get promise() { return promise },
    /** Actual framework readiness admits runtime operations. */
    ready(runtime: HistoireRuntimeSnapshot) {
      clearTimeout(timer)
      timer = undefined
      settled = true
      resolve(runtime)
    },
    /** Failed runtime settles promptly without leaving a deadline active. */
    fail(error: unknown) {
      clearTimeout(timer)
      timer = undefined
      settled = true
      reject(error)
    },
  }
}
