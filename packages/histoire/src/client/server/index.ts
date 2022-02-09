import { createApp, h } from 'vue'
import type { StoryFile } from '../../node/types'
import Story from './Story.server.vue'
import Variant from './Variant.server.vue'

export async function run (file: StoryFile, storyData, el) {
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

  // eslint-disable-next-line vue/multi-word-component-names
  app.component('Story', Story)
  // eslint-disable-next-line vue/multi-word-component-names
  app.component('Variant', Variant)

  app.mount(el)
  app.unmount()
}
