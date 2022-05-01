import { createApp, h } from 'vue'
import { registerVueComponents } from '@histoire/controls'
import type { StoryFile, Variant as TVariant } from '../../node/types'
import RenderApp from './RenderApp.vue'
import Story from '../app/components/exposed/Story.vue'
import Variant from '../app/components/exposed/Variant.vue'

export async function run (file: StoryFile, variant: TVariant) {
  const { default: Comp } = await import(file.moduleId)

  return new Promise((resolve, reject) => {
    try {
      const el = document.createElement('div')
      document.body.append(el)

      const app = createApp({
        errorCaptured (err: any, instance, info) {
          err.instance = instance
          err.info = info
          reject(err)
        },
        render () {
          return h(RenderApp, {
            story: file.story,
            variant: variant,
            onReady,
          }, [
            h(Comp, {
              story: file.story,
            }),
          ])
        },
      })

      // eslint-disable-next-line vue/multi-word-component-names
      app.component('Story', Story)
      // eslint-disable-next-line vue/multi-word-component-names
      app.component('Variant', Variant)

      registerVueComponents(app)

      app.mount(el)

      function onReady () {
        const html = document.body.innerHTML
        app.unmount()

        document.body.removeChild(el)
        resolve({
          html,
        })
      }
    } catch (err) {
      reject(err)
    }
  })
}
