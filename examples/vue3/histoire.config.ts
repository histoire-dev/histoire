import { defineConfig } from 'histoire'
import { HstVue } from '@histoire/plugin-vue'

export default defineConfig({
  // outDir: 'hdist',
  plugins: [
    HstVue(),
  ],
})
