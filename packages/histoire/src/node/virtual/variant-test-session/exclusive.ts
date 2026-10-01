/**
 * Creates a one-at-a-time queue for session work.
 *
 * Overlapping collect/run flows would otherwise interleave their global
 * test-registry save/restore (see `withRegistry`) and corrupt
 * `__HST_TEST_REGISTRY__`. The preview runtime creates a single session object,
 * so one chain per session is enough to guard the shared globalThis.
 * @returns A `runExclusive(fn)` function resolving/rejecting with `fn`'s result.
 */
export function createExclusiveQueue() {
  let chain: Promise<unknown> = Promise.resolve()

  return function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    // Run regardless of the previous outcome so a failed flow can't wedge the queue.
    const result = chain.then(fn, fn)
    // Keep the chain alive even when this flow rejects.
    chain = result.then(() => undefined, () => undefined)
    return result
  }
}
