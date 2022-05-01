import { defineConfig } from 'histoire'
import { HstScreenshot } from '@histoire/plugin-screenshot'

export default defineConfig({
  plugins: [
    HstScreenshot({
      ignored: ({ file }) => file.includes('tailwind-tokens'),
    }),
  ],
})
