import { HstVue } from '@histoire/plugin-vue'
import { defineConfig } from 'histoire'

export default defineConfig({
  ui: { framePadding: 24 },
  plugins: [
    HstVue(),
  ],
})
