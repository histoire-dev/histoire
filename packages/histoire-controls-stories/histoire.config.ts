import { defineConfig } from 'histoire'
import { HstVue } from '@histoire/plugin-vue'

export default defineConfig({
  plugins: [
    HstVue(),
    {
      name: 'builtin:tailwind-tokens',
    },
  ],

  storyMatch: ['../histoire-controls/src/**/*.story.vue'],

  setupFile: '/histoire-setup.ts',

  theme: {
    title: 'Histoire controls',
    favicon: 'histoire.svg',
  },

  tree: {
    groups: [
      {
        id: 'top',
        title: '',
      },
      {
        id: 'controls',
        title: 'Controls',
      },
      {
        id: 'design-system',
        title: 'Design System',
      },
    ],
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
