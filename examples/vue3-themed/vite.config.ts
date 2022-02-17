/// <reference types="histoire" />

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [
    vue(),
  ],

  histoire: {
    theme: {
      title: 'Acme Design System',
      favicon: '/my-favicon.svg',
      logo: {
        square: '/src/img/logo-square.svg',
        light: '/src/img/logo-light.svg',
        dark: '/src/img/logo-dark.svg',
      },
    },
    setupFile: '/src/histoire-setup.ts',
  },
})
