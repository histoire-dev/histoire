import './histoire.css'
import { defineSetupVue3 } from '@histoire/plugin-vue'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import GlobalComp from './components/GlobalComp.vue'

export const setupVue3 = defineSetupVue3(({ app }) => {
  app.provide('demo', 42)
  const pinia = createPinia()
  app.use(pinia)

  if (!process.env.HISTOIRE_DEV) {
    const i18n = createI18n({})
    app.use(i18n)
  }

  app.component('GlobalComp', GlobalComp)

  app.directive('dashed-border', {
    beforeMount: (el, { value }) => {
      el.style.border = `1px dashed ${value}`
    },
  })
})
