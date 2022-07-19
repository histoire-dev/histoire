/// <reference types="histoire"/>

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [
    vue(),
  ],

  resolve: {
    alias: {
      'floating-vue': '@histoire/vendors/dist/client/floating-vue.js',
      '@iconify/vue': '@histoire/vendors/dist/client/iconify.js',
      pinia: '@histoire/vendors/dist/client/pinia.js',
      'scroll-into-view-if-needed': '@histoire/vendors/dist/client/scroll.js',
      shiki: '@histoire/vendors/dist/client/shiki.js',
      'vue-router': '@histoire/vendors/dist/client/vue-router.js',
      '@vueuse/core': '@histoire/vendors/dist/client/vue-use.js',
      vue: '@histoire/vendors/dist/client/vue.js',
    },
  },

  build: {
    emptyOutDir: false,

    lib: {
      entry: 'src/index.ts',
      formats: [
        'es',
      ],
      fileName: 'index',
    },

    rollupOptions: {
      external: [
        /@histoire/,
      ],
    },
  },

  histoire: {
    setupFile: '/src/histoire-setup.ts',
    vite: (config) => {
      config.plugins = [{
        name: 'my-vite-config',
        enforce: 'post',
        config (config) {
          config.build.lib = false
          config.build.rollupOptions.external = []
        },
      }]
    },
    theme: {
      title: 'Histoire controls',
      favicon: '/histoire.svg',
    },
  },
})
