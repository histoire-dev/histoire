import type { HistoireSurface } from '@histoire/protocol'
import type { EmbedSurfaceContext } from '../surfaces.js'
import { HistoireEvents, HistoireProvider, HistoireSearch, HistoireStoryTree, HistoireToolbar } from '@histoire/vue'
import { createApp, h } from 'vue'

/** Independent data parts share parent proxy; no router, active session, or story loader. */
export function createEmbedNavigationView(context: EmbedSurfaceContext, surface: HistoireSurface) {
  const component = { tree: HistoireStoryTree, search: HistoireSearch, toolbar: HistoireToolbar, events: HistoireEvents }[surface as 'tree' | 'search' | 'toolbar' | 'events']
  const app = createApp({ render: () => h(HistoireProvider, { session: context.session }, { default: () => h(component) }) })
  app.mount(context.container)
  return { ready: Promise.resolve(), close: () => app.unmount() }
}
