import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'fs-extra'
import path from 'pathe'

export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'histoire:preserve:import.meta',
      enforce: 'pre',
      transform (code) {
        if (code.includes('import.meta')) {
          return {
            code: code.replace(/import\.meta/g, 'import__meta'),
          }
        }
      },
      closeBundle () {
        try {
          const files = fs.readdirSync('./dist/bundled')
          for (const file of files) {
            if (file.endsWith('.js')) {
              const filePath = path.join('./dist/bundled', file)
              const content = fs.readFileSync(filePath, 'utf-8')
              if (content.includes('import__meta')) {
                fs.writeFileSync(filePath, content.replace(/import__meta/g, 'import.meta'), 'utf-8')
              }
            }
          }
        } catch (e) {
          console.error(e)
        }
      },
    },
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
        /@vue\/*/,
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
