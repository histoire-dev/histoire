import { createApp, h } from 'vue'
import { registerVueComponents } from '@histoire/controls'
import type { StoryFile } from '../../node/types'
import Story from './Story.server.vue'
import Variant from './Variant.server.vue'

export async function run (file: StoryFile, storyData, el, setupFilePath: string) {
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

  if (setupFilePath) {
    const setup = await import('file://' + setupFilePath)

    if (typeof setup?.setupVue3 === 'function') {
      await setup.setupVue3({ app })
    }
  }

  // eslint-disable-next-line vue/multi-word-component-names
  app.component('Story', Story)
  // eslint-disable-next-line vue/multi-word-component-names
  app.component('Variant', Variant)

  registerVueComponents(app)

  app.mount(el)
  app.unmount()
}
