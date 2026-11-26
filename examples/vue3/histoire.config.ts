import type { ReferenceUi } from 'histoire-example-plugin-reference'
import { HstA11y } from '@histoire/plugin-a11y'
import { HstDesigns } from '@histoire/plugin-designs'
import { HstVue } from '@histoire/plugin-vue'
import { HstVueDevtools } from '@histoire/plugin-vue-devtools'
import { defineConfig, getDefaultConfig } from 'histoire'
import { referencePlugin } from 'histoire-example-plugin-reference'

export default defineConfig({
  inspection: {
    enabled: true,
    components: true,
    accessibility: true,
    diagnostics: true,
    allowedOrigins: [process.env.HISTOIRE_DEVFRAME_ORIGIN ?? 'http://127.0.0.1:4638'],
  },
  embed: { enabled: true, allowedOrigins: [process.env.HISTOIRE_DEVFRAME_ORIGIN ?? 'http://127.0.0.1:4638'] },
  visual: {},
  ui: { frameBudget: 12, framePadding: 24 },
  // outDir: 'hdist',
  plugins: [
    HstVue(),
    HstA11y({ test: true }),
    HstDesigns(),
    HstVueDevtools({
      enabled: process.env.HISTOIRE_VUE_DEVTOOLS !== 'false',
      clientAuthToken: process.env.HISTOIRE_VUE_DEVTOOLS_TOKEN,
    }),
    // Reference workbench plugin with React views in a Vue project. Try another variant with
    // HISTOIRE_REFERENCE_UI=vue|dom|svelte.
    referencePlugin({ ui: (process.env.HISTOIRE_REFERENCE_UI as ReferenceUi | undefined) ?? 'react', minTargetSize: 40 }),
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
