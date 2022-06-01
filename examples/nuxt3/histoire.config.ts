import { defineConfig } from 'histoire'
import { HstNuxt } from '@histoire/plugin-nuxt'
// import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [
    HstNuxt(),
  ],
  vite: {
    plugins: [
      // vue(),
    ],
  },
})
