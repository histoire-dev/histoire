/// <reference types="histoire" />

import path from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  // Example build config for a component library
  build: {
    lib: {
      entry: path.resolve(__dirname, './src/main.ts'),
      name: 'histoire-kit',
      fileName: format => `histoire-kit.${format}.js`,
    },

    rollupOptions: {
      // make sure to externalize deps that shouldn't be bundled
      // into your library
      external: ['vue'],
      output: {
        // Provide global variables to use in the UMD build
        // for externalized deps
        globals: {
          vue: 'Vue',
        },
      },
    },
  },

  server: {
    hmr: {
      clientPort: process.env.CODESPACES ? 443 : undefined,
    },
    port: 5173,
    host: true,

  },

  plugins: [
    vue(),
  ],

  histoire: {
    plugins: [
      {
        name: 'test',
        config() {
          return {
            theme: {
              logoHref: 'http://histoire.dev',
              favicon: 'histoire.svg',
            },
          }
        },
      },
    ],

    // Alternative way of specifying histoire config
    setupFile: '/src/histoire.setup.ts',

    // theme: {
    //   logoHref: 'http://histoire.dev',
    // },

    tree: {
      groups: [
        {
          id: 'top',
          title: '',
        },
        {
          title: 'My Group',
          include: file => /Code gen|Controls|Docs/.test(file.title),
        },
        {
          title: 'Components',
          include: file => !file.title.includes('Serialize'),
        },
      ],
    },
  },
})
