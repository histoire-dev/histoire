/** Minimal listener shape shared by browser transport fixtures. */
export type EmbedPortListener = (event: { data: unknown }) => void

/** Owned in-memory MessagePort equivalent; tests exercise lifecycle, not browser framing. */
export interface EmbedTestPort {
  /** Posted payloads before structured cloning. */
  sent: unknown[]
  /** Publish to paired port asynchronously with real structured-clone semantics. */
  postMessage: (data: unknown) => void
  /** Add a future-message listener. */
  addEventListener: (type: 'message', listener: EmbedPortListener) => void
  /** Remove only matching listener. */
  removeEventListener: (type: 'message', listener: EmbedPortListener) => void
  /** Start delivery, matching browser MessagePort ownership. */
  start: () => void
  /** Close once and prevent queued delivery after teardown. */
  close: () => void
  /** Current resource state for cleanup assertions. */
  isClosed: () => boolean
}

/** One shared transport fixture, reused by later bridge/session integration tests. */
export function createEmbedPortPair(): { parent: EmbedTestPort, child: EmbedTestPort } {
  const sides = [0, 1].map(() => ({ closed: false, started: false, listeners: new Set<EmbedPortListener>(), sent: [] as unknown[] }))
  const ports = sides.map((side, index): EmbedTestPort => ({
    sent: side.sent,
    postMessage(data) {
      if (side.closed) return
      const cloned = structuredClone(data)
      side.sent.push(data)
      queueMicrotask(() => {
        const peer = sides[1 - index]
        if (side.closed || peer.closed || !peer.started) return
        for (const listener of peer.listeners) listener({ data: cloned })
      })
    },
    addEventListener(_type, listener) {
      side.listeners.add(listener)
    },
    removeEventListener(_type, listener) {
      side.listeners.delete(listener)
    },
    start() {
      side.started = true
    },
    close() {
      side.closed = true
      side.listeners.clear()
    },
    isClosed: () => side.closed,
  }))
  return { parent: ports[0], child: ports[1] }
}
