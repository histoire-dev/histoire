/// <reference types="histoire" />

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [
    vue(),
  ],

  histoire: {
    plugins: [
      {
        name: 'test',
        config () {
          return {
            theme: {
              logoHref: 'http://histoire.dev',
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
