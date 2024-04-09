/// <reference types="histoire" />

import { defineConfig } from 'vite'
import { sveltekit } from '@sveltejs/kit/vite'
import { HstSvelte } from '@histoire/plugin-svelte'

export default defineConfig({
  plugins: [
    sveltekit(),
  ],
  histoire: {
    plugins: [
      HstSvelte(),
    ],
    setupFile: './src/histoire.setup.ts',
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
