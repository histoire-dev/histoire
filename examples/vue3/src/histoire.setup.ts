import { defineSetupVue3 } from '@histoire/plugin-vue'
import { createPinia } from 'pinia'
import GlobalComp from './components/GlobalComp.vue'
import WrapperGlobal from './components/WrapperGlobal.vue'
import './histoire.css'

declare module 'histoire' {
  // Extend the story `meta` prop
  interface CommonMeta {
    /**
     * Set to `false` to disable the `WrapperGlobal` component styling.
     */
    wrapper?: boolean
  }
}

export const setupVue3 = defineSetupVue3(({ app, addWrapper }) => {
  app.provide('demo', 42)
  const pinia = createPinia()
  app.use(pinia)

  app.component('GlobalComp', GlobalComp)

  app.directive('dashed-border', {
    beforeMount: (el, { value }) => {
      el.style.border = `1px dashed ${value}`
    },
  })

  addWrapper(WrapperGlobal)
})
