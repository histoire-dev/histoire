/// <reference types="histoire" />

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [
    vue(),
  ],

  histoire: {
    // Alternative way of specifying histoire config
    setupFile: '/src/histoire.setup.ts',
  },
})
