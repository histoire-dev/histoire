import type { HistoireRuntimeSnapshot } from '@histoire/protocol'
import type { EmbedSurfaceContext } from '../surfaces.js'
import { HistoireExplorer, HistoireProvider } from '@histoire/vue'
import { createApp, h } from 'vue'
import { createExplorerViewSession } from './explorer-session.js'

/** Source-origin Explorer composes same native parts around one outer SDK runtime owner. */
export function createEmbedExplorerView(context: EmbedSurfaceContext) {
  const owner = createExplorerViewSession(context)
  let resolve: (value: HistoireRuntimeSnapshot | void) => void
  let reject: (error: unknown) => void
  const ready = new Promise<HistoireRuntimeSnapshot | void>((yes, no) => {
    resolve = yes
    reject = no
  })
  void ready.catch(() => {})
  const app = createApp({ render: () => h(HistoireProvider, { session: owner.session, onError: reject }, {
    default: () => h(HistoireExplorer, { onReady: () => resolve(owner.runtime()), onError: reject }),
  }) })
  let closing: Promise<void> | undefined
  try {
    context.signal.throwIfAborted()
    app.mount(context.container)
    if (!owner.session.getSnapshot().selection?.variantId) resolve()
  }
  catch (error) {
    app.unmount()
    void owner.close().catch(() => {})
    throw error
  }
  return { ready, request: owner.request,
    /** Provider tears down child views; join direct ownership before returning. */
    close() {
      return closing ??= Promise.resolve().then(async () => {
        app.unmount()
        await owner.close()
      })
    } }
}
