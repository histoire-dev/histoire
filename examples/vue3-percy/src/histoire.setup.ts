import './histoire.css'
import { defineSetupVue3 } from 'histoire/client'

export const setupVue3 = defineSetupVue3(({ app }) => {
  app.provide('demo', 24)
})
