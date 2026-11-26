import { defineConfig } from 'histoire'
import { referencePlugin } from 'histoire-example-plugin-reference'

/**
 * Merged with the `histoire` key of `vite.config.ts`. The reference workbench plugin lives here,
 * like in the other examples, so test fixtures that replace this file start without it.
 */
export default defineConfig({
  ui: { framePadding: 24 },
  plugins: [
    // Svelte 4 views (`svelte4View`): vite-plugin-svelte dedupes `svelte` to this project's
    // Svelte 4, which the precompiled variant imports; the Svelte 5 variant cannot load here.
    referencePlugin({ ui: 'svelte4' }),
  ],
})
