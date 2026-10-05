/// <reference types="vitest" />

import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

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
    emptyOutDir: false,

    lib: {
      entry: 'src/index.ts',
      formats: [
        'es',
      ],
      fileName: 'index.es',
    },

    rollupOptions: {
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
