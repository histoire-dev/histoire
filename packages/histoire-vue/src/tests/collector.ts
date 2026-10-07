import type { HistoireSession } from '@histoire/sdk'
import type { HistoireTestsModel } from './model.js'

/** Owns automatic definition collection for one first-party Tests surface. */
export function createHistoireTestsCollector(session: HistoireSession, model: HistoireTestsModel) {
  let active = true
  let owner: string | null = null

  /** Collects once for each exact ready source, target, and runtime identity. */
  function synchronize(): void {
    const snapshot = session.getSnapshot()
    if (!active) return
    if (snapshot.status !== 'ready' || snapshot.stale || snapshot.runtime.status !== 'ready' || !snapshot.selection?.variantId || !snapshot.capabilities.previewTests.available) {
      owner = null
      return
    }

    const current = JSON.stringify([snapshot.source, snapshot.selection, snapshot.runtime.runtimeId])
    if (current === owner) return
    owner = current
    void model.controller.collect().catch(() => {
      // Controller publishes attributable collection failures. Navigation and
      // retired runtime replies must never escape as unhandled rejections.
    })
  }

  const stop = session.subscribe(synchronize)
  synchronize()

  return {
    /** Stops observation and retires in-flight panel work exactly once. */
    close(): void {
      if (!active) return
      active = false
      stop()
      model.controller.close()
    },
  }
}
