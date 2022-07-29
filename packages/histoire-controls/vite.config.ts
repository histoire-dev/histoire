/// <reference types="histoire"/>

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [
    vue(),
  ],

  resolve: {
    alias: {
      'floating-vue': '@histoire/vendors/floating-vue',
      '@iconify/vue': '@histoire/vendors/iconify',
      pinia: '@histoire/vendors/pinia',
      'scroll-into-view-if-needed': '@histoire/vendors/scroll',
      'vue-router': '@histoire/vendors/vue-router',
      '@vueuse/core': '@histoire/vendors/vue-use',
      vue: '@histoire/vendors/vue',
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
