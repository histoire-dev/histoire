import type { EmbedSurfaceContext } from '../surfaces.js'
import { HistoireProvider } from '@histoire/vue'
import { HistoireDocs, HistoireSource } from '@histoire/vue/internal'
import { createApp, h } from 'vue'

/** Source-owned iframe renders same native parts against finite parent session proxy. */
export function createEmbedContentView(context: EmbedSurfaceContext, surface: 'docs' | 'source') {
  const component = surface === 'docs' ? HistoireDocs : HistoireSource
  const app = createApp({ render: () => h(HistoireProvider, { session: context.session }, { default: () => h(component) }) })
  app.mount(context.container)
  return { ready: Promise.resolve(), close: () => app.unmount() }
}
