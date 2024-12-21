// https://v3.nuxtjs.org/api/configuration/nuxt.config
export default defineNuxtConfig({
  modules: [
    '@nuxtjs/tailwindcss',
  ],

  runtimeConfig: {
    public: {
      configFromNuxt: 'test',
    },
  },

  compatibilityDate: '2024-12-20',
})
