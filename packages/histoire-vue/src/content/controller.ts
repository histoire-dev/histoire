import type { HistoireSession } from '@histoire/sdk'

/** A panel keeps only current prepared content, never canonical source/session state. */
export interface HistoireContentState<T> {
  /** Read/preparation lifecycle; absent selection remains idle. */
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** Prepared current publication, cleared before every replacement read. */
  value: T | null
  /** Read or preparation failure; unsafe HTML never becomes fallback value. */
  error: unknown
}

/** One read owner spans fetch, sanitization, and highlighting; abandoned work stays observed. */
export function createHistoireContentController<T>(session: HistoireSession, identity: () => readonly unknown[], read: () => Promise<T | null>, publish: (state: HistoireContentState<T>) => void) {
  let active = true
  let generation = 0
  let owner = identity()
  let unsubscribe: (() => void) | undefined
  /** Referential state identity also handles cyclic runtime mirrors without JSON serialization. */
  const same = (left: readonly unknown[], right: readonly unknown[]) => left.length === right.length && left.every((value, index) => value === right[index])
  /** Refresh clears old content synchronously and checks ownership after all asynchronous preparation. */
  async function refresh() {
    if (!active) return
    const current = ++generation
    owner = identity()
    const captured = owner
    const snapshot = session.getSnapshot()
    // Disconnect/disposal is lifecycle retirement, never a new content failure.
    if (snapshot.status !== 'ready' || snapshot.stale) {
      publish({ status: 'idle', value: null, error: null })
      return
    }
    publish({ status: 'loading', value: null, error: null })
    try {
      const value = await read()
      if (active && current === generation && same(captured, identity())) publish({ status: value === null ? 'idle' : 'ready', value, error: null })
    }
    catch (error) {
      if (active && current === generation && same(captured, identity())) publish({ status: 'error', value: null, error })
    }
  }
  /** Local appearance observers avoid a second read after SDK already published same owner. */
  function refreshIfChanged() {
    return same(owner, identity()) ? Promise.resolve() : refresh()
  }
  return {
    refresh,
    refreshIfChanged,
    /** Client mount opts into data reads; SSR component setup does not access DOM. */
    start() {
      if (!unsubscribe && active) unsubscribe = session.subscribe(() => void refreshIfChanged())
      return refresh()
    },
    /** Provider owns observer/publication only; caller-owned session remains alive. */
    close() {
      active = false
      generation++
      unsubscribe?.()
      unsubscribe = undefined
    },
  }
}
