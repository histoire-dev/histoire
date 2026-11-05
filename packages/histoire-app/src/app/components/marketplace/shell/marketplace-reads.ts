/** Track modal read visits independently of server job admission. */
export function createMarketplaceReads() {
  const cleanups = new Set<() => void>()
  /** Register retirement of one mounted read owner; unregister at scope disposal. */
  function onClose(cleanup: () => void): () => void {
    cleanups.add(cleanup)
    return () => {
      cleanups.delete(cleanup)
    }
  }
  /** Close invalidates reads before Vue unmounts their consumers. */
  function abortReads(): void {
    for (const cleanup of cleanups) cleanup()
  }
  return { onClose, abortReads }
}
