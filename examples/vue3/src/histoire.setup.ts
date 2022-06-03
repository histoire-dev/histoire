import './histoire.css'
import { defineSetupVue3 } from 'histoire/client'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'

export const setupVue3 = defineSetupVue3(({ app }) => {
  app.provide('demo', 42)
  const pinia = createPinia()
  app.use(pinia)

  const i18n = createI18n()
  app.use(i18n)
})
