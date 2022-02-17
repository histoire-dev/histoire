/// <reference types="histoire" />

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  publicDir: 'meow',

  plugins: [
    vue(),
  ],

  histoire: {
    // Alternative way of specifying histoire config
    setupFile: '/src/histoire.setup.ts',
    theme: {
      setupFile: '/src/histoire.theme.setup.ts',
    },
  },
})
