import { defineSetupVue3 } from '@histoire/plugin-vue'

// Styles
import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'

// Vuetify
import { createVuetify } from 'vuetify'

export const setupVue3 = defineSetupVue3(({ app }) => {
  app.use(createVuetify())
})
