import type { ExecutionService } from './execution-service.js'
import type { ExecutionHandle, ExecutionTask } from './execution-types.js'
import { hasUnconfirmedCleanup, withCleanupDeadline } from './cleanup.js'
import { ExecutionError } from './execution-types.js'

/** Drains captured handles; unknown teardown quarantines the shared scheduler. */
export async function drainExecutionHandles(execution: ExecutionService, handles: readonly ExecutionHandle<unknown>[], timeoutMs = 10_000): Promise<void> {
  for (const handle of handles) handle.cancel()
  await withCleanupDeadline(Promise.all(handles.map(handle => handle.result.catch((error) => {
    if (hasUnconfirmedCleanup(error)) throw error
  }))).then(() => {}), timeoutMs).catch((error) => {
    execution.quarantine()
    throw error instanceof ExecutionError ? error : new ExecutionError('CLEANUP_UNCONFIRMED', 'Execution cleanup could not be confirmed', error)
  })
}

/** Scopes cancellation to one resource owner while sharing the project FIFO lane. */
export function createExecutionOwner(execution: ExecutionService, cleanupTimeoutMs = 10_000): ExecutionService {
  const handles = new Set<ExecutionHandle<unknown>>()
  let closed = false
  let draining: Promise<void> | undefined
  let closing: Promise<void> | undefined
  let unsafeCleanupError: unknown
  /** Cancels only captured submissions and joins their confirmed teardown. */
  function cancelAll() {
    if (draining) return draining
    draining = drainExecutionHandles(execution, [...handles], cleanupTimeoutMs).then(() => {
      // Settled handles leave the set, but unknown resources still belong here.
      if (unsafeCleanupError) throw unsafeCleanupError
    }).catch((error) => {
      if (hasUnconfirmedCleanup(error)) unsafeCleanupError ??= error
      throw error
    }).finally(() => {
      draining = undefined
    })
    return draining
  }
  return {
    /** Parent quarantine and current owner drain both block new admission. */
    get available() {
      return !closed && !draining && execution.available
    },
    /** Counts only this adapter's waiting jobs. */
    get pendingCount() {
      return [...handles].filter(handle => handle.state === 'queued').length
    },
    /** Retains cancellation ownership until task cleanup has settled. */
    enqueue<T>(task: ExecutionTask<T>) {
      if (closed || draining) throw new ExecutionError('UNAVAILABLE', 'Server execution is unavailable')
      const handle = execution.enqueue(task)
      handles.add(handle)
      void handle.result.catch((error) => {
        if (hasUnconfirmedCleanup(error)) unsafeCleanupError ??= error
      }).finally(() => {
        handles.delete(handle)
      }).catch(() => {})
      return handle
    },
    cancelAll,
    /** Unknown cleanup in any scoped owner quarantines the actual shared scheduler. */
    quarantine: () => execution.quarantine(),
    /** Marks this owner closed without permanently closing the project lane. */
    close() {
      closed = true
      return closing ??= cancelAll()
    },
  }
}
