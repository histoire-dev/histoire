import { defineConfig } from 'histoire'
import { HstVue } from '@histoire/plugin-vue'
import { HstPercy } from '@histoire/plugin-percy'

export default defineConfig({
  plugins: [
    HstVue(),
    HstPercy({
      ignored: ({ file }) => file.includes('tailwind-tokens'),
    }),
  ],
})
