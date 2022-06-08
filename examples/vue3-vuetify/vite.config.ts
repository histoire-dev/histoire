/// <reference types="histoire" />

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'

export default defineConfig({
  plugins: [
    vue(),
    vuetify({
      autoImport: true,
    }),
  ],

  histoire: {
    setupFile: 'src/histoire.setup.ts',
  },
})
