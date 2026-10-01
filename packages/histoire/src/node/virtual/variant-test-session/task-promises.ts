/**
 * Drains assertions registered on a task, including ones added while draining.
 * Ignore promises owned by the caller: a unit test may itself await this run
 * through expect(...).rejects, which must never be awaited from inside the run.
 */
export async function settleTestPromises(task: any, ignored = new Set<Promise<unknown>>()) {
  const seen = new Set(ignored)
  const errors: unknown[] = []
  if (!task) return errors
  for (;;) {
    const pending: Promise<unknown>[] = (task.promises ?? []).filter((promise: Promise<unknown>) => !seen.has(promise))
    if (!pending.length) break
    pending.forEach(promise => seen.add(promise))
    const results = await Promise.allSettled(pending)
    for (const result of results) {
      if (result.status === 'rejected') errors.push(result.reason)
    }
    // Soft assertions can retain their fulfilled tracking promise in Vitest's
    // array. Remove only this batch so another phase cannot report it twice.
    task.promises = task.promises.filter((promise: Promise<unknown>) => !pending.includes(promise))
  }
  return errors
}

/**
 * Detaches pending assertions after their owning test already failed or timed
 * out. `allSettled` observes later rejections while allowing teardown to run.
 */
export function discardTestPromises(task: any, ignored = new Set<Promise<unknown>>()) {
  if (!task) return
  const pending: Promise<unknown>[] = (task.promises ?? []).filter((promise: Promise<unknown>) => !ignored.has(promise))
  task.promises = task.promises?.filter((promise: Promise<unknown>) => !pending.includes(promise))
  void Promise.allSettled(pending)
}
