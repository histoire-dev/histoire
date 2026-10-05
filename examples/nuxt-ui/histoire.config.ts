import { HstNuxt } from '@histoire/plugin-nuxt'
import { HstVue } from '@histoire/plugin-vue'
import { defineConfig } from 'histoire'

export default defineConfig({
  plugins: [HstVue(), HstNuxt()],
  storyMatch: ['app/components/**/*.story.vue'],
  theme: { title: 'Nuxt UI and rstore' },
  sandboxDarkClass: 'dark',
  embed: { enabled: true, allowedOrigins: ['http://localhost:5173', 'http://127.0.0.1:5173'] },
})
