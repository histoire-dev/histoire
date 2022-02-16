/// <reference types="histoire" />

import { defineConfig } from 'vite'

export default defineConfig({
  histoire: {
    // Alternative way of specifying histoire config
    setupFile: '/histoire.setup.ts',
    theme: {
      setupFile: '/histoire.theme.setup.ts',
      title: 'Toast',
    },
  },
})
