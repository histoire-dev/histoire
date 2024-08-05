import { defineSetupVue3 } from '@histoire/plugin-vue'
import { createI18n } from 'vue-i18n'

import { i18nConfig } from './i18n.config'

export const setupVue3 = defineSetupVue3(({ app }) => {
  app.use(createI18n(i18nConfig))
})
