import { defineConfig } from 'histoire'
import { HstPercy } from '@histoire/plugin-percy'

export default defineConfig({
  plugins: [
    HstPercy({
      ignored: ({ file }) => file.includes('tailwind-tokens'),
    }),
  ],
})
