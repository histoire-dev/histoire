import type { BrowserOptions } from './options.js'
import { defineWorkbenchPlugin, installPluginStyles } from '@histoire/plugin-kit'
import { defineWorkbenchComponent } from '@histoire/plugin-kit/vue'
import { defineComponent, h } from 'vue'
import { sideBySideView } from './workbench/canvas/side-by-side-view.js'
import DesignPanel from './workbench/DesignPanel.vue'
import { createDesignModel } from './workbench/model.js'
import css from './workbench/styles.css?inline'

export default defineWorkbenchPlugin({
  id: 'designs',
  apiVersion: 1,
  async setup(api) {
    installPluginStyles(document, 'designs', css, api.signal)
    const options = (api.options ?? {}) as Partial<BrowserOptions>
    const model = createDesignModel(api, {
      embedHost: options.embedHost ?? 'histoire',
      // Relative image paths resolve against the book, wherever it is served.
      baseUrl: new URL(import.meta.env.BASE_URL, document.baseURI).href,
    })
    // Contributions register once the selected story is known: a tab restored from the URL is
    // dropped when it is unavailable at that point.
    const selected = api.context.selection.target
    if (selected) await model.preload(selected.storyId)
    api.inspector.addTab({
      id: 'design',
      label: 'Design',
      icon: 'color-palette',
      // Hidden for variants without designs; the first read starts loading the story.
      available: context => model.has(context.frame.target),
      component: defineWorkbenchComponent(defineComponent({
        name: 'DesignInspector',
        props: {
          /** Current frame scope. */
          context: { type: Object, required: true },
        },
        setup: props => () => h(DesignPanel, { context: props.context as any, model }),
      })),
    })
    if (options.canvasView === false) return
    api.canvas.addView({ id: 'side-by-side', label: 'Design', icon: 'color-palette', ...sideBySideView(model) })
  },
})
