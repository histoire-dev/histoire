import type { HistoireBridgeIdentity, HistoireEvent } from '@histoire/protocol'
import type { HistoireSession } from '../types.js'
import { validateWireValue } from '@histoire/protocol'

/** Bounded retained/future replay, kept separate from 8 MiB view snapshot projection. */
export function createMountEventStream(session: HistoireSession, publish: (payload: { items: readonly HistoireEvent[], reset?: boolean, droppedCount?: number }, owner: Partial<HistoireBridgeIdentity>) => void) {
  let previous: readonly HistoireEvent[] | undefined
  let previousDropped = 0
  let identity = ''
  /** Parent history is canonical; clear and document/selection replacement publish explicit reset. */
  function synchronize() {
    const snapshot = session.getSnapshot()
    const current = JSON.stringify([snapshot.source?.epoch, snapshot.runtime.runtimeId, snapshot.selection])
    const owner = { ...(snapshot.runtime.runtimeId ? { runtimeId: snapshot.runtime.runtimeId } : {}), ...(snapshot.selection ? { target: snapshot.selection } : {}) }
    const items = snapshot.events.items
    const reset = !previous || identity !== current || (previous.length > 0 && items.length === 0) || snapshot.events.droppedCount < previousDropped
    if (reset) publish({ items: [], reset: true, ...(snapshot.events.droppedCount ? { droppedCount: snapshot.events.droppedCount } : {}) }, owner)
    else if (snapshot.events.droppedCount > previousDropped) publish({ items: [], droppedCount: snapshot.events.droppedCount - previousDropped }, owner)
    const last = identity === current ? previous?.at(-1)?.sequence ?? -1 : -1
    const pending = items.filter(event => event.sequence > last)
    let batch: HistoireEvent[] = []
    /** Flush respects publication byte budget as well as small batch count. */
    const flush = () => {
      if (batch.length) publish({ items: batch }, owner)
      batch = []
    }
    for (const event of pending) {
      try {
        validateWireValue({ items: [...batch, event] }, { kind: 'event', name: 'events.appended' })
      }
      catch { flush() }
      batch.push(event)
      if (batch.length >= 32) flush()
    }
    flush()
    previous = items
    previousDropped = snapshot.events.droppedCount
    identity = current
  }
  synchronize()
  return session.subscribe(synchronize)
}
