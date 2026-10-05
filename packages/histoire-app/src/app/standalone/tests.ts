import type { HistoireSession } from '@histoire/sdk'
import type { HistoireTestsModel } from '@histoire/vue/internal'

/** Standalone preserves automatic definition collection, never automatic execution. */
export function createStandaloneTests(session: HistoireSession, model: HistoireTestsModel) {
  let active = true
  let owner: string | null = null
  /** Collect once for each exact ready source/target/document; failures require explicit retry. */
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
      // Shared controller already publishes attributable failure. Page exit,
      // navigation and collection errors must never leak unhandled rejection.
    })
  }
  const stop = session.subscribe(synchronize)
  synchronize()
  return {
    /** Model remains provider-scoped, with no standalone store or active global. */
    model,
    /** Adapter owns collection subscription plus single controller cancellation. */
    close(): void {
      if (!active) return
      active = false
      stop()
      model.controller.close()
    },
  }
}
