/// <reference types="histoire" />

import { HstSvelte } from '@histoire/plugin-svelte'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    svelte(),
  ],
  histoire: {
    setupFile: './src/histoire.setup.ts',
    plugins: [
      HstSvelte(),
    ],
    tree: {
      groups: [
        {
          id: 'top',
          title: '',
        },
      ],
    },
  },
})
