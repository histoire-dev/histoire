import { HstPercy } from '@histoire/plugin-percy'
import { HstVue } from '@histoire/plugin-vue'
import { defineConfig } from 'histoire'

export default defineConfig({
  plugins: [
    HstVue(),
    HstPercy({
      ignored: ({ file }) => file.includes('tailwind-tokens'),
    }),
  ],
})
