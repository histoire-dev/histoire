import { defineConfig, getDefaultConfig } from 'histoire'
import { HstVue } from '@histoire/plugin-vue'

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
})
