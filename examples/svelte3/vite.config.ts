/// <reference types="histoire" />

import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { HstSvelte } from '@histoire/plugin-svelte'

export default defineConfig({
  plugins: [
    svelte(),
  ],
  histoire: {
    plugins: [
      HstSvelte(),
    ],
  },
})
