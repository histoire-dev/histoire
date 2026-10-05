export default defineNuxtConfig({
  compatibilityDate: '2025-02-10',
  devtools: { enabled: false },
  modules: ['@nuxt/ui', '@rstore/nuxt'],
  app: { baseURL: '/_stories/' },
  css: ['~/assets/css/main.css'],
  // Keep fixture entirely local and let Histoire own explicit appearance.
  ui: { fonts: false, colorMode: false },
  icon: { provider: 'none' },
  rstore: { experimentalGarbageCollection: false },
  // Module-generated plugin loads rstore after initial dependency scan.
  // Declare it so first runtime discovery needs no second optimizer reload.
  vite: { optimizeDeps: { include: ['@rstore/vue'] } },
})
