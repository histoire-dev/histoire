import { HistoireSdkError } from '@histoire/protocol'
import { hasUnconfirmedCleanup } from '../runtime/cleanup.js'
import { throwIfTestAborted } from '../util/test-abort.js'

/** Own one collection budget across eligibility, process startup, browser work, and teardown. */
export function createCollectionDeadline(timeoutMs: number, external?: AbortSignal, until = Date.now() + timeoutMs) {
  const controller = new AbortController()
  const signal = external ? AbortSignal.any([external, controller.signal]) : controller.signal
  const timer = setTimeout(() => controller.abort(), Math.max(0, until - Date.now()))
  timer.unref?.()
  return {
    /** Absolute deadline is private IPC metadata, never supplied by browser callers. */
    until,
    /** All collection phases observe the same cancellation authority. */
    signal,
    /** Synchronous cloning/validation must not outrun a timer waiting for the event loop. */
    assertCurrent() {
      if (Date.now() >= until) controller.abort()
      throwIfTestAborted(signal)
    },
    /** Teardown uncertainty takes precedence over timeout and external cancellation. */
    failure(error: unknown): unknown {
      if (!hasUnconfirmedCleanup(error) && !external?.aborted && (controller.signal.aborted || Date.now() >= until)) {
        return new HistoireSdkError('TIMEOUT', 'Histoire test collection timed out.')
      }
      return error
    },
    /** Clear safety timer after confirmed terminal completion or failure. */
    close: () => clearTimeout(timer),
  }
}
