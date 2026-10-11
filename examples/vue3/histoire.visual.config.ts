import { HstVue } from '@histoire/plugin-vue'
import { defineConfig } from 'histoire'

/** Bounded deterministic adoption suite; ordinary projects capture every variant. */
export default defineConfig({
  plugins: [HstVue()],
  storyMatch: ['src/components/VisualRegression.story.vue'],
  collectMaxThreads: 1,
  setupFile: '',
  browser: { source: 'headless-shell' },
  visual: {
    exclude: ['**/*.story.js'],
    profiles: [
      { id: 'light', width: 320, height: 240, colorScheme: 'light' },
      { id: 'dark', width: 320, height: 240, colorScheme: 'dark', backgroundColor: '#18181b' },
    ],
  },
})
