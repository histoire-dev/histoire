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
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        ...Object.keys(require('./package.json').dependencies),
      ],

      input: [
        'src/client/app/api.ts',
        'src/client/app/index.ts',
        'src/client/app/sandbox.ts',
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
    cssCodeSplit: false,
    minify: false,
  },
})
