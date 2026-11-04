/**
 * Builds the idempotent shutdown sequence of a terminal session.
 * Terminal state is released before the runtime is awaited, so restoring the shell never waits on a child.
 * Every step runs even when an earlier one failed; failures are rethrown once all steps finished.
 * @param steps Release of terminal-owned state, and close of the bound runtime if any.
 * @param steps.release Restores raw input, panel and listeners synchronously.
 * @param steps.close Closes the runtime host; waits for the host when none is bound yet (shutdown requested during startup).
 */
export function createShutdown(steps: { release: () => void, close: () => Promise<void> | undefined }): () => Promise<void> {
  let closing: Promise<void> | undefined
  return () => closing ??= (async () => {
    const failures: unknown[] = []
    try {
      steps.release()
    }
    catch (error) {
      failures.push(error)
    }
    try {
      await steps.close()
    }
    catch (error) {
      failures.push(error)
    }
    if (failures.length === 1) throw failures[0]
    if (failures.length) throw new AggregateError(failures, 'Shutdown failed')
  })()
}
