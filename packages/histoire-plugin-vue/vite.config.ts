import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [
    vue(),
  ],

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
        hoistTransitiveImports: false,
      },
      treeshake: false,
      preserveEntrySignatures: 'strict',
    },
  },
})
