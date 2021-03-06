import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'fs-extra'
import { globbySync } from 'globby'

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
          const files = globbySync('./dist/bundled/**/*.js')
          for (const file of files) {
            const content = fs.readFileSync(file, 'utf-8')
            if (content.includes('import__meta')) {
              fs.writeFileSync(file, content.replace(/import__meta/g, 'import.meta'), 'utf-8')
            }
          }
        } catch (e) {
          console.error(e)
        }
      },
    },
  ],

  resolve: {
    alias: {
      'floating-vue': '@histoire/vendors/dist/client/floating-vue.js',
      '@iconify/vue': '@histoire/vendors/dist/client/iconify.js',
      pinia: '@histoire/vendors/dist/client/pinia.js',
      'scroll-into-view-if-needed': '@histoire/vendors/dist/client/scroll.js',
      'vue-router': '@histoire/vendors/dist/client/vue-router.js',
      '@vueuse/core': '@histoire/vendors/dist/client/vue-use.js',
      vue: '@histoire/vendors/dist/client/vue.js',
    },
  },

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
        // hoistTransitiveImports: false,
        preserveModules: true,
        preserveModulesRoot: 'src/client/app',
      },
      treeshake: false,
      preserveEntrySignatures: 'strict',
    },
    cssCodeSplit: false,
    minify: false,
  },
})
