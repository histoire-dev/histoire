import { defineConfig } from 'histoire'
import { HstVue } from '@histoire/plugin-vue'

export default defineConfig({
  plugins: [
    HstVue(),
  ],

  storyMatch: ['../histoire-controls/src/**/*.story.vue'],

  setupFile: '/histoire-setup.ts',

  theme: {
    title: 'Histoire controls',
    favicon: 'histoire.svg',
  },

  vite: {
    server: {
      fs: {
        allow: [
          '../histoire-controls/src',
        ],
      },
    },
  },
})
