/** Staging gate shared by sandbox documents that would otherwise boot at once. */
export interface SandboxBootGate {
  /**
   * Wait for this document's turn. The first caller of a burst leads and gets
   * its turn immediately; later callers wait until the leader releases (or
   * the wait times out). Resolves with the release function, which only the
   * leader's call actually needs; it is safe to call more than once. Rejects
   * when `signal` aborts first.
   */
  enter: (signal: AbortSignal) => Promise<() => void>
}

/**
 * Creates a gate staging a burst of sandbox documents: one boots first, the
 * rest follow together.
 *
 * Every sandbox is its own document importing the same ~200 modules. Booted
 * together, each document requests all of them before any response lands in
 * the browser cache. Letting one document boot first fills the cache, so the
 * followers read shared modules locally; measured on a 7-cell matrix this
 * roughly halves the time until every cell is ready.
 * @param timeoutMs Longest time followers wait for a slow or stuck leader.
 */
export function createSandboxBootGate(timeoutMs = 3000): SandboxBootGate {
  /** Pending leader turn of the current burst; unset between bursts. */
  let leader: Promise<void> | undefined

  return {
    async enter(signal) {
      signal.throwIfAborted()
      if (!leader) {
        let resolve!: () => void
        const burst = new Promise<void>((done) => {
          resolve = done
        })
        let timer: ReturnType<typeof setTimeout> | undefined
        const release = () => {
          clearTimeout(timer)
          // The next document after this burst leads a new one.
          if (leader === burst) leader = undefined
          resolve()
        }
        // A stuck leader must not hold followers forever.
        timer = setTimeout(release, timeoutMs)
        leader = burst
        return release
      }
      const current = leader
      await new Promise<void>((resolve, reject) => {
        const abort = () => reject(signal.reason)
        signal.addEventListener('abort', abort, { once: true })
        current.then(() => {
          signal.removeEventListener('abort', abort)
          resolve()
        })
      })
      return () => {}
    },
  }
}

/** Gate shared by all Matrix cells of this workbench document. */
export const matrixSandboxBootGate = createSandboxBootGate()
