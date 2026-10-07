import type { EmbedSurfaceContext } from '../surfaces.js'
import { HistoireProvider } from '@histoire/vue'
import { createHistoireTestsCollector, createHistoireTestsModel, HistoireTests, provideHistoireTestsModel } from '@histoire/vue/internal'
import { createApp, defineComponent, h } from 'vue'

/** Test view collects definitions automatically but leaves assertion execution explicit. */
export function createEmbedTestsView(context: EmbedSurfaceContext) {
  const model = createHistoireTestsModel(context.session)
  const collector = createHistoireTestsCollector(context.session, model)
  const Root = defineComponent({
    /** Provides one session-scoped model to the collector and native panel. */
    setup: () => {
      provideHistoireTestsModel(model)
      return () => h(HistoireProvider, { session: context.session }, { default: () => h(HistoireTests) })
    },
  })
  const app = createApp(Root)
  try {
    app.mount(context.container)
  }
  catch (error) {
    collector.close()
    app.unmount()
    throw error
  }
  return {
    ready: Promise.resolve(),
    /** Retires collection before unmounting provider-owned native controls. */
    close: () => {
      collector.close()
      app.unmount()
    },
  }
}
