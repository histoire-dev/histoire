/// <reference types="histoire" />

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
// @TODO investigate ESM errors when this is imported in vite.config.ts
// https://github.com/vitejs/vite/issues/7981
// import { HstScreenshot } from '@histoire/plugin-screenshot'

export default defineConfig({
  plugins: [
    vue(),
  ],

  histoire: {
    // plugins: [
    //   HstScreenshot(),
    // ],

    // Alternative way of specifying histoire config
    setupFile: '/src/histoire.setup.ts',
  },
})
