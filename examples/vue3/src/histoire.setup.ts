import './histoire.css'
import { defineSetupVue3 } from 'histoire/client'
import { createPinia } from 'pinia'

export const setupVue3 = defineSetupVue3(({ app }) => {
  app.provide('demo', 42)
  const pinia = createPinia()
  app.use(pinia)
})
