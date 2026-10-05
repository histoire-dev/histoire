import type { ExecutionHandle, ExecutionState, ExecutionTask } from './execution-types.js'
import { hasUnconfirmedCleanup } from './cleanup.js'
import { ExecutionError } from './execution-types.js'

/** Injectable bounds without importing MCP, Vite or project modules into the lane. */
export interface ExecutionServiceOptions {
  /** Maximum waiting jobs across UI and MCP callers. */
  queuedTotal?: number
  /** Maximum waiting MCP jobs for one principal. */
  queuedPerPrincipal?: number
  /** Deadline for confirming owned cleanup and shutdown. */
  cleanupTimeoutMs?: number
}

/** Private queue record; all submitted result promises are rejection-observed. */
interface Pending {
  /** Submitted ownership and work. */
  task: ExecutionTask<unknown>
  /** Mutable lifecycle. */
  state: ExecutionState
  /** Job-owned abort controller. */
  abort: AbortController
  /** Promise fulfillment. */
  resolve: (result: unknown) => void
  /** Promise rejection. */
  reject: (error: unknown) => void
  /** Cleanup-complete promise. */
  settled: Promise<unknown>
}

/** Enforce cleanup bounds while observing late settlement of abandoned work. */
async function deadline(work: Promise<unknown>, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([work, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new ExecutionError('CLEANUP_UNCONFIRMED', 'Execution cleanup could not be confirmed')), timeoutMs)
    })])
  }
  finally { clearTimeout(timer) }
}

/** One FIFO server lane; cancellation cannot overlap an unconfirmed runner. */
export function createExecutionService(options: ExecutionServiceOptions = {}) {
  const queue: Pending[] = []
  const queuedTotal = options.queuedTotal ?? 8
  const queuedPerPrincipal = options.queuedPerPrincipal ?? 4
  const cleanupTimeoutMs = options.cleanupTimeoutMs ?? 10_000
  let active: Pending | undefined
  let unavailable = false
  let unsafeCleanupError: unknown
  let closed = false
  let closing: Promise<void> | undefined
  let draining: Promise<void> | undefined

  /** Notify observers without letting external feedback wedge cleanup. */
  function state(record: Pending, value: ExecutionState) {
    record.state = value
    try {
      record.task.onState?.(value)
    }
    catch { /* Observers cannot alter scheduler ownership. */ }
  }

  /** Remove a waiting record or signal an active one without settling early. */
  function cancel(record: Pending) {
    if (record.state === 'queued') {
      queue.splice(queue.indexOf(record), 1)
      record.abort.abort()
      state(record, 'cancelled')
      record.reject(new ExecutionError('CANCELLED', 'Execution cancelled'))
    }
    else if (record.state === 'running') {
      state(record, 'cancelling')
      record.abort.abort()
    }
  }

  /** Run next job after every previous runner has confirmed cleanup. */
  function pump() {
    if (active || unavailable || closed || !queue.length) return
    active = queue.shift()!
    const record = active
    state(record, 'running')
    void (async () => {
      let result: unknown
      let failure: unknown
      let failed = false
      try {
        record.abort.signal.throwIfAborted()
        record.task.validate?.()
        result = await record.task.run(record.abort.signal)
      }
      catch (error) {
        failure = error
        failed = true
        // Runners can discover unsafe teardown while unwinding internally.
        // A later no-op cleanup cannot restore certainty about those resources.
        if (hasUnconfirmedCleanup(error)) {
          unavailable = true
          unsafeCleanupError ??= error
          for (const pending of [...queue]) cancel(pending)
        }
      }
      try {
        await deadline(Promise.resolve().then(() => record.task.cleanup?.()), cleanupTimeoutMs)
      }
      catch (error) {
        unavailable = true
        failed = true
        failure = new ExecutionError('CLEANUP_UNCONFIRMED', 'Execution cleanup could not be confirmed', failure ?? error)
        unsafeCleanupError ??= failure
        for (const pending of [...queue]) cancel(pending)
      }
      if (failed && !(record.abort.signal.aborted && !unavailable)) {
        state(record, 'failed')
        record.reject(failure)
      }
      else if (record.abort.signal.aborted) {
        state(record, 'cancelled')
        record.reject(new ExecutionError('CANCELLED', 'Execution cancelled'))
      }
      else {
        state(record, 'completed')
        record.resolve(result)
      }
      active = undefined
      pump()
    })().catch((error) => {
      // A scheduler-internal fault must never silently start another runner.
      unavailable = true
      record.reject(error)
    })
  }

  /** Join an existing restart/shutdown drain and reject admission while it runs. */
  function cancelAll() {
    if (draining) return draining
    for (const record of [...queue]) cancel(record)
    if (active) cancel(active)
    draining = deadline(active?.settled.catch(() => {}) ?? Promise.resolve(), cleanupTimeoutMs).catch((error) => {
      unavailable = true
      unsafeCleanupError ??= error
      throw error
    }).then(() => {
      if (unavailable) throw unsafeCleanupError ?? new ExecutionError('CLEANUP_UNCONFIRMED', 'Execution cleanup could not be confirmed')
    }).finally(() => { draining = undefined })
    return draining
  }

  return {
    /** False after shutdown or any unconfirmed teardown. Metadata stays readable. */
    get available() { return !unavailable && !closed && !draining },
    /** Current active job and total pending count, without disclosing job data. */
    get pendingCount() { return queue.length },
    /** Atomic synchronous admission shared by UI and MCP. */
    enqueue<T>(task: ExecutionTask<T>): ExecutionHandle<T> {
      if (unavailable || closed || draining) throw new ExecutionError('UNAVAILABLE', 'Server execution is unavailable')
      const waiting = active ? queue : queue.slice(1)
      if ((active || queue.length) && (waiting.length >= queuedTotal || (task.principal && waiting.filter(item => item.task.principal === task.principal).length >= queuedPerPrincipal))) {
        throw new ExecutionError('QUEUE_FULL', 'Server execution queue is full')
      }
      let resolve!: (result: unknown) => void
      let reject!: (error: unknown) => void
      const result = new Promise<T>((fulfilled, rejected) => {
        resolve = fulfilled as typeof resolve
        reject = rejected
      })
      void result.catch(() => {})
      const record: Pending = { task, state: 'queued', abort: new AbortController(), resolve, reject, settled: result }
      queue.push(record)
      // Admit before any caller can observe execution; duplicate requests can
      // reconcile a recorded operation before this microtask starts resources.
      queueMicrotask(pump)
      return {
        get state() { return record.state },
        result,
        cancel: () => cancel(record),
      }
    },
    /** Invalidate queued/active work before project generation teardown. */
    cancelAll,
    /** Blocks lane reuse after any owner's unconfirmed teardown, observing active work. */
    quarantine() {
      unavailable = true
      for (const pending of [...queue]) cancel(pending)
    },
    /** Mark closed immediately, then wait for owned runner teardown. */
    close() {
      if (!closing) {
        closed = true
        closing = cancelAll()
      }
      return closing
    },
  }
}

/** Controller-owned shared lane type for UI integration and operation adapters. */
export type ExecutionService = ReturnType<typeof createExecutionService>
