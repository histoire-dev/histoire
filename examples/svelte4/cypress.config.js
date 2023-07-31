import { defineConfig } from 'cypress'

export default defineConfig({
  viewportWidth: 1280,
  viewportHeight: 768,
  chromeWebSecurity: false,

  retries: {
    runMode: 2,
    openMode: 0,
  },

  e2e: {
    baseUrl: 'http://localhost:4567',
    setupNodeEvents (on, config) {
      // implement node event listeners here
    },
  },
})
