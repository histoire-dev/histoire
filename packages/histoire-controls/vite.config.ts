/// <reference types="vitest" />

import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { rolldownWatchOptions } from '../../scripts/vite-watch.mjs'

export default defineConfig({
  define: { __HISTOIRE_CONTROLS_PEER__: 'false' },
  plugins: [
    vue(),
  ],
  resolve: {
    alias: process.env.VITEST
      ? { 'vue-router': fileURLToPath(new URL('../histoire-vendors/node_modules/vue-router/dist/vue-router.mjs', import.meta.url)) }
      : {
          'floating-vue': '@histoire/vendors/floating-vue',
          '@iconify/vue': '@histoire/vendors/iconify',
          'pinia': '@histoire/vendors/pinia',
          'scroll-into-view-if-needed': '@histoire/vendors/scroll',
          'vue-router': '@histoire/vendors/vue-router',
          '@vueuse/core': '@histoire/vendors/vue-use',
          'vue': '@histoire/vendors/vue',
        },
  },

  build: {
    watch: rolldownWatchOptions('controls'),
    emptyOutDir: false,

    lib: {
      entry: 'src/index.ts',
      formats: [
        'es',
      ],
      fileName: 'index.es',
    },

    rolldownOptions: {
      external: [
        /@histoire/,
      ],
    },
  },

  test: {
    environment: 'jsdom',
    globals: true,
  },
})
