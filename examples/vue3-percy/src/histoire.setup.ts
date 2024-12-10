import { defineSetupVue3 } from '@histoire/plugin-vue'
import './histoire.css'

export const setupVue3 = defineSetupVue3(({ app }) => {
  app.provide('demo', 24)
})
