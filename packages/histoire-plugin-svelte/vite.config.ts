import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [
    svelte(),
  ],
  build: {
    emptyOutDir: false,
    outDir: 'dist',
    rollupOptions: {
      external: (source, importer) => {
        if ((importer?.includes('histoire-plugin-svelte/src') || importer?.startsWith('src/')) && source.startsWith('.')) {
          return false
        }
        return !source.includes('histoire-plugin-svelte/src') && !source.startsWith('src/')
      },

      input: [
        'src/client/index.ts',
        'src/collect/index.ts',
        'src/index.ts',
      ],

      output: {
        // manualChunks (id) {
        //   if (id.includes('node_modules')) {
        //     return 'vendor'
        //   }
        // },
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name][extname]',
        // hoistTransitiveImports: false,
        preserveModules: true,
        preserveModulesRoot: 'src',
      },
      treeshake: false,
      preserveEntrySignatures: 'strict',
    },
  },
})
