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
    setupNodeEvents(on) {
      // Headless screen must contain largest acceptance viewport without clipping.
      on('before:browser:launch', (browser, options) => {
        if (browser.name === 'electron' && browser.isHeadless) {
          options.preferences.width = 1800
          options.preferences.height = 1200
        }
        return options
      })
    },
  },

  video: false,
})
