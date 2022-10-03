import Vue, { h } from 'vue'
import type { ServerRunPayload } from '@histoire/shared'
// @ts-expect-error virtual module id
import * as setup from 'virtual:$histoire-setup'
// @ts-expect-error virtual module id
import * as generatedSetup from 'virtual:$histoire-generated-global-setup'
import Story from './Story'
import Variant from './Variant'

export async function run ({ file, storyData, el }: ServerRunPayload) {
  const { default: Comp } = await import(/* @vite-ignore */ file.moduleId)

  // Call app setups to resolve global assets such as components
  const appOptions: Record<string, any> = {}

  if (typeof generatedSetup?.setupVue2 === 'function') {
    const result = await generatedSetup.setupVue2({
      story: null,
      variant: null,
    })
    if (result) {
      Object.assign(appOptions, result)
    }
  }

  if (typeof setup?.setupVue2 === 'function') {
    const result = await setup.setupVue2({
      story: null,
      variant: null,
    })
    if (result) {
      Object.assign(appOptions, result)
    }
  }

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
    ...appOptions,
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
