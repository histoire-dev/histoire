import type { I18nOptions } from 'vue-i18n'

export const i18nConfig: I18nOptions = {
  legacy: false,
  locale: 'fr',
  messages: {
    en: {},
    es: {},
    fr: {},
  },
}

export default defineI18nConfig(() => i18nConfig)
