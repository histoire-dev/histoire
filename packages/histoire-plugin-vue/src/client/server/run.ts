import type { ServerRunPayload } from '@histoire/shared'
import type { Vue3StorySetupApi, Vue3StorySetupHandler } from '../../helpers.js'
// @ts-expect-error virtual module id
import * as generatedSetup from 'virtual:$histoire-generated-global-setup'
// @ts-expect-error virtual module id
import * as setup from 'virtual:$histoire-setup'
import { createApp, h } from 'vue'
import Story from './Story'
import Variant from './Variant'

export async function run({ file, storyData, el }: ServerRunPayload) {
  const { default: Comp } = await import(/* @vite-ignore */ file.moduleId)

  const app = createApp({
    provide: {
      addStory(data) {
        storyData.push(data)
      },
    },
    render() {
      return h(Comp, {
        ref: 'comp',
        data: file,
      })
    },
  })

  app.component('Story', Story)

  app.component('Variant', Variant)

  // Call app setups to resolve global assets such as components

  const setupApi: Vue3StorySetupApi = {
    app,
    story: null,
    variant: null,
    addWrapper: () => { /* noop */ },
  }

  if (typeof generatedSetup?.setupVue3 === 'function') {
    const setupFn = generatedSetup.setupVue3 as Vue3StorySetupHandler
    await setupFn(setupApi)
  }

  if (typeof setup?.setupVue3 === 'function') {
    const setupFn = setup.setupVue3 as Vue3StorySetupHandler
    await setupFn(setupApi)
  }

  app.mount(el)

  if (Comp.doc) {
    const el = document.createElement('div')
    el.innerHTML = Comp.doc
    const text = el.textContent
    storyData.forEach((s) => {
      s.docsText = text
    })
  }

  app.unmount()
}
