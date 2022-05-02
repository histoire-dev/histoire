import { createApp, h } from 'vue'
import { registerVueComponents } from '@histoire/controls'
import type { ServerRunPayload } from '../index.js'
import Story from './Story.vue'
import Variant from './Variant.vue'
// @ts-expect-error virtual module id
import * as setup from '$histoire-setup'

export async function run ({ file, storyData, el }: ServerRunPayload) {
  const { default: Comp } = await import(file.moduleId)
  const app = createApp({
    provide: {
      addStory (data) {
        storyData.push(data)
      },
    },
    render () {
      return h(Comp, {
        ref: 'comp',
        data: file,
      })
    },
  })

  if (typeof setup?.setupVue3 === 'function') {
    await setup.setupVue3({ app })
  }

  // eslint-disable-next-line vue/multi-word-component-names
  app.component('Story', Story)
  // eslint-disable-next-line vue/multi-word-component-names
  app.component('Variant', Variant)

  registerVueComponents(app)

  app.mount(el)
  app.unmount()
}
