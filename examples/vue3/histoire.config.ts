import { HstVue } from '@histoire/plugin-vue'
import { defineConfig, getDefaultConfig } from 'histoire'

export default defineConfig({
  // outDir: 'hdist',
  plugins: [
    HstVue(),
  ],
  backgroundPresets: [
    ...(getDefaultConfig().backgroundPresets || []),
    {
      label: 'Custom gray',
      color: '#cafff5',
      contrastColor: '#005142',
    },
  ],
  // autoApplyContrastColor: true,
  // routerMode: 'hash',
  theme: {
    darkClass: 'my-dark',
  },
})
