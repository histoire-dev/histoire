import type { HistoireRuntimeSnapshot } from '@histoire/protocol'
import type { EmbedSurfaceContext } from '../surfaces.js'
import { createExtensionHost, createSessionContext, lazyWorkbenchPlugins } from '@histoire/plugin-kit'
import { HistoireEmbed, HistoireExplorer, HistoireProvider } from '@histoire/vue'
import { workbenchPlugins } from 'virtual:$histoire-workbench-plugins'
import { createApp, h } from 'vue'
import { createExplorerViewSession } from './explorer-session.js'

/**
 * Extension host of the book's own plugin manifest, like the standalone workbench: this
 * document is served by the book, so it may evaluate the book's plugins. Remote hosts never do.
 * @param session Explorer view session.
 */
function createExplorerExtensions(session: EmbedSurfaceContext['session']) {
  if (!workbenchPlugins.length) return undefined
  const root = createSessionContext({ session, mode: session.getSnapshot().source?.mode ?? 'static' })
  const host = createExtensionHost({ plugins: lazyWorkbenchPlugins(workbenchPlugins), services: { context: root.context } })
  return { host, async dispose() {
    await host.dispose()
    root.close()
  } }
}

/** Source-origin Explorer composes same native parts around one outer SDK runtime owner. */
export function createEmbedExplorerView(context: EmbedSurfaceContext) {
  const owner = createExplorerViewSession(context)
  const extensions = context.presentation ? undefined : createExplorerExtensions(owner.session)
  let resolve: (value: HistoireRuntimeSnapshot | void) => void
  let reject: (error: unknown) => void
  const ready = new Promise<HistoireRuntimeSnapshot | void>((yes, no) => {
    resolve = yes
    reject = no
  })
  void ready.catch(() => {})
  const app = createApp({ render: () => h(HistoireProvider, { session: owner.session, extensions: extensions?.host, onError: reject }, {
    default: () => context.presentation
      ? h(HistoireEmbed, { scope: context.presentation.scope, panels: context.presentation.panels, padding: context.padding, onReady: () => resolve(owner.runtime()), onError: reject })
      : h(HistoireExplorer, { onReady: () => resolve(owner.runtime()), onError: reject }),
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
    void extensions?.dispose()
    throw error
  }
  return { ready, request: owner.request,
    /** Provider tears down child views; join direct ownership before returning. */
    close() {
      return closing ??= Promise.resolve().then(async () => {
        app.unmount()
        try {
          await owner.close()
        }
        finally {
          await extensions?.dispose()
        }
      })
    } }
}
