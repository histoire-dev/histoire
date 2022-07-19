import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    emptyOutDir: false,
    outDir: 'dist/bundled',
    lib: {
      entry: '',
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        /\$histoire/,
        /@histoire/,
        'vue',
      ],

      input: [
        'src/client/client.ts',
        'src/client/server.ts',
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
        preserveModulesRoot: 'src/client',
      },
      treeshake: false,
      preserveEntrySignatures: 'strict',
    },
  },
})
