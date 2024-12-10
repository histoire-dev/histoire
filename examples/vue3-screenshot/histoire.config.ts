import { HstScreenshot } from '@histoire/plugin-screenshot'
import { HstVue } from '@histoire/plugin-vue'
import { defineConfig } from 'histoire'

export default defineConfig({
  plugins: [
    HstVue(),
    HstScreenshot({
      ignored: ({ file }) => file.includes('tailwind-tokens'),
    }),
  ],
})
