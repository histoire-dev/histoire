import { HstNuxt } from '@histoire/plugin-nuxt'
import { HstVue } from '@histoire/plugin-vue'
import { defineConfig } from 'histoire'

export default defineConfig({
  setupFile: './app/histoire.setup.ts',
  plugins: [
    HstVue(),
    HstNuxt(),
  ],
})
