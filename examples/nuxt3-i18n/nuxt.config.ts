import { defineNuxtConfig } from 'nuxt/config'
// https://v3.nuxtjs.org/api/configuration/nuxt.config
export default defineNuxtConfig({
  modules: [
    '@nuxtjs/tailwindcss',
    '@nuxtjs/i18n',
  ],
  runtimeConfig: {
    public: {
      configFromNuxt: 'test',
    },
  },
  i18n: {
    vueI18n: './i18n.config.ts',
    locales: [
      {
        code: 'en',
        iso: 'en-GB',
        name: 'English',
      },
      {
        code: 'es',
        iso: 'es-ES',
        name: 'Español',
      },
      {
        code: 'fr',
        iso: 'fr-FR',
        name: 'Français',
      },
    ],
  },
  compatibilityDate: '2024-08-01',
})
