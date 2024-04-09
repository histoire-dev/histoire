import Vue, { h } from 'vue'
import type { ServerRunPayload } from '@histoire/shared'
// @ts-expect-error virtual module id
import * as setup from 'virtual:$histoire-setup'
// @ts-expect-error virtual module id
import * as generatedSetup from 'virtual:$histoire-generated-global-setup'
import type { Vue2StorySetupApi, Vue2StorySetupHandler } from '../../index.js'
import Story from './Story'
import Variant from './Variant'

export async function run({ file, storyData, el }: ServerRunPayload) {
  const { default: Comp } = await import(/* @vite-ignore */ file.moduleId)

  // Call app setups to resolve global assets such as components
  const appOptions: Record<string, any> = {}

  const setupApi: Vue2StorySetupApi = {
    story: null,
    variant: null,
    addWrapper: () => { /* noop */ },
  }

  if (typeof generatedSetup?.setupVue2 === 'function') {
    const setupFn = generatedSetup.setupVue2 as Vue2StorySetupHandler
    const result = await setupFn(setupApi)
    if (result) {
      Object.assign(appOptions, result)
    }
  }

  if (typeof setup?.setupVue2 === 'function') {
    const setupFn = setup.setupVue2 as Vue2StorySetupHandler
    const result = await setupFn(setupApi)
    if (result) {
      Object.assign(appOptions, result)
    }
  }

  const app = new Vue({
    provide: {
      htsFile: file,
      addStory(data) {
        storyData.push(data)
      },
    },
    render() {
      return h(Comp, {
        ref: 'comp',
      })
    },
    ...appOptions,
  })

  Vue.component('Story', Story)

  Vue.component('Variant', Variant)

  app.$mount(el)

  if (Comp.doc) {
    const el = document.createElement('div')
    el.innerHTML = Comp.doc
    const text = el.textContent
    storyData.forEach((s) => {
      s.docsText = text
    })
  }

  app.$destroy()
}
