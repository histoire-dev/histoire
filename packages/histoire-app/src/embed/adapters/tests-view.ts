import type { EmbedSurfaceContext } from '../surfaces.js'
import { HistoireProvider } from '@histoire/vue'
import { HistoireTests } from '@histoire/vue/internal'
import { createApp, h } from 'vue'

/** Test view consumes parent session; only explicit user actions execute tests. */
export function createEmbedTestsView(context: EmbedSurfaceContext) {
  const app = createApp({ render: () => h(HistoireProvider, { session: context.session }, { default: () => h(HistoireTests) }) })
  app.mount(context.container)
  return { ready: Promise.resolve(), close: () => app.unmount() }
}
