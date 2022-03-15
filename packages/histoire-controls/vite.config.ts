/// <reference types="@peeky/test"/>
/// <reference types="histoire"/>

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [
    vue(),
  ],

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
        'vue',
      ],
    },
  },

  histoire: {
    setupFile: '/src/histoire-setup.ts',
    vite: (config) => {
      config.build.lib = false
      config.build.rollupOptions.external = []
    },
    theme: {
      title: 'Histoire controls',
      favicon: '/histoire.svg',
    },
  },

  test: {
    runtimeEnv: 'dom',
    previewSetupFiles: [
      'src/peeky-preview.ts',
    ],
  },
})
