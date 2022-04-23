import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { defaultColors } from 'histoire'

export default defineConfig({
  plugins: [
    vue(),
  ],

  histoire: {
    theme: {
      title: 'Acme Design System',
      favicon: 'my-favicon.svg',
      logo: {
        square: '/src/img/logo-square.svg',
        light: '/src/img/logo-light.svg',
        dark: '/src/img/logo-dark.svg',
      },
      colors: {
        primary: defaultColors.cyan,
      },
    },
    setupFile: '/src/histoire-setup.ts',
    // vite: {
    //   server: {
    //     port: 3042,
    //   },
    // },
  },
})
