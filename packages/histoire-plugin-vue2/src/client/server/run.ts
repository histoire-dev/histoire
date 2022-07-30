import Vue, { h } from 'vue'
import type { ServerRunPayload } from '@histoire/shared'
import Story from './Story'
import Variant from './Variant'

export async function run ({ file, storyData, el }: ServerRunPayload) {
  const { default: Comp } = await import(file.moduleId)

  const app = new Vue({
    provide: {
      htsFile: file,
      addStory (data) {
        storyData.push(data)
      },
    },
    render () {
      return h(Comp, {
        ref: 'comp',
      })
    },
  })

  // eslint-disable-next-line vue/multi-word-component-names
  Vue.component('Story', Story)
  // eslint-disable-next-line vue/multi-word-component-names
  Vue.component('Variant', Variant)

  app.$mount(el)

  if (Comp.doc) {
    const el = document.createElement('div')
    el.innerHTML = Comp.doc
    const text = el.textContent
    storyData.forEach(s => {
      s.docsText = text
    })
  }

  app.$destroy()
}
