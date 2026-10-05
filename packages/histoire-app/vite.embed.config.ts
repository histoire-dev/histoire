import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

/** Source UI uses Histoire's vendor Vue independently of the story framework. */
const reusableUi = new Set(['@histoire/vue', '@histoire/vue/internal', '@histoire/controls/vue'])

/** Separate pure data build preserves existing standalone bundled-app file layout. */
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: [
      { find: /^@histoire\/vue\/internal$/, replacement: fileURLToPath(new URL('../histoire-vue/src/internal.ts', import.meta.url)) },
      { find: /^@histoire\/vue$/, replacement: fileURLToPath(new URL('../histoire-vue/src/index.ts', import.meta.url)) },
      { find: /^@histoire\/controls\/vue$/, replacement: fileURLToPath(new URL('../histoire-controls/src/index.ts', import.meta.url)) },
      { find: 'vue', replacement: '@histoire/vendors/vue' },
      { find: 'floating-vue', replacement: '@histoire/vendors/floating-vue' },
      { find: '@iconify/vue', replacement: '@histoire/vendors/iconify' },
      { find: '@vueuse/core', replacement: '@histoire/vendors/vue-use' },
    ],
  },
  build: {
    emptyOutDir: false,
    outDir: 'dist/embed',
    minify: false,
    // These modules are bundled again by each book. Let the final Vite build
    // own preload injection rather than redeclaring helpers in compiled input.
    lib: {
      entry: {
        'index': 'src/embed/index.ts',
        'source': 'src/embed/source.ts',
        'capabilities': 'src/embed/capabilities.ts',
        'adapters/state': 'src/embed/adapters/state.ts',
        'adapters/layout': 'src/embed/adapters/layout.ts',
        'adapters/state-presets': 'src/embed/adapters/state-presets.ts',
        // Explicit filename keeps generated runtime imports stable across input roots.
        'app/standalone/presets': 'src/app/standalone/presets.ts',
      },
      formats: ['es'],
    },
    rollupOptions: {
      external(id) {
        if (reusableUi.has(id)) return false
        return /^virtual:|^@histoire\/|^@vue\//.test(id) || id === 'fuse.js'
      },
      preserveEntrySignatures: 'strict',
      output: { format: 'es', preserveModules: true, preserveModulesRoot: 'src/embed', entryFileNames: '[name].js', chunkFileNames: '[name].js' },
    },
  },
})
