/** One source/surface document lifetime, closed before asynchronous cleanup. */
export function createEmbedDocumentLifecycle(window: Window) {
  const controller = new AbortController()
  const cleanups = new Set<() => Promise<void> | void>()
  let closing: Promise<void> | undefined
  /** Retire before awaits so late callbacks cannot publish into replacement. */
  function close(): Promise<void> {
    if (closing) {
      return closing
    }
    controller.abort()
    window.removeEventListener('pagehide', pagehide)
    closing = Promise.allSettled([...cleanups].map(cleanup => Promise.resolve().then(cleanup))).then(() => {
      cleanups.clear()
    })
    return closing
  }
  /** Navigation and unload close dedicated ports without automatic reconnect. */
  function pagehide(): void {
    void close()
  }
  window.addEventListener('pagehide', pagehide, { once: true })
  return {
    signal: controller.signal,
    close,
    /** Register only resources owned by this document. */
    add(cleanup: () => Promise<void> | void) {
      if (controller.signal.aborted) {
        void Promise.resolve().then(cleanup).catch(() => {
        })
      }
      else {
        cleanups.add(cleanup)
      }
    },
  }
}
