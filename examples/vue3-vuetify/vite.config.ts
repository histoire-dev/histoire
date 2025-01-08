/// <reference types="histoire" />

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
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
