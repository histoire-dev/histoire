import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import fs from 'fs-extra'
import { globbySync } from 'globby'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'histoire:preserve:import.meta',
      enforce: 'pre',
      transform(code) {
        if (code.includes('import.meta')) {
          return {
            code: code.replace(/import\.meta/g, 'import__meta'),
          }
        }
      },
      closeBundle() {
        try {
          const files = globbySync('./dist/bundled/**/*.js')
          for (const file of files) {
            const content = fs.readFileSync(file, 'utf-8')
            if (content.includes('import__meta')) {
              fs.writeFileSync(file, content.replace(/import__meta/g, 'import.meta'), 'utf-8')
            }
          }
        }
        catch (e) {
          console.error(e)
        }
      },
    },
  ],

  resolve: {
    alias: {
      '@histoire/vue/internal': fileURLToPath(new URL('../histoire-vue/src/internal.ts', import.meta.url)),
      '@histoire/vue': fileURLToPath(new URL('../histoire-vue/src/index.ts', import.meta.url)),
      '@histoire/controls/vue': fileURLToPath(new URL('../histoire-controls/src/index.ts', import.meta.url)),
      'floating-vue': '@histoire/vendors/floating-vue',
      '@iconify/vue': '@histoire/vendors/iconify',
      'pinia': '@histoire/vendors/pinia',
      'scroll-into-view-if-needed': '@histoire/vendors/scroll',
      'vue-router': '@histoire/vendors/vue-router',
      '@vueuse/core': '@histoire/vendors/vue-use',
      'vue': '@histoire/vendors/vue',
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
      // Native UI source must pass through existing vendor aliases so this
      // document never mixes a host Vue copy with Histoire's vendor Vue.
      external(id) {
        if (id === '@histoire/vue' || id === '@histoire/vue/internal' || id === '@histoire/controls/vue') return false
        // eslint-disable-next-line ts/no-require-imports
        const dependencies = Object.keys(require('./package.json').dependencies)
        return /\$histoire|@histoire/.test(id) || dependencies.some(name => id === name || id.startsWith(`${name}/`))
      },

      // The sandbox document is no longer a bundled app entry: it loads the
      // generated `virtual:$histoire-preview-runtime` (see bundle-sandbox.js).
      input: [
        'src/app/api.ts',
        'src/app/reusable.ts',
        'src/app/index.ts',
        // Generated sandbox runtime imports this bootstrap directly.
        'src/app/util/controls-document.ts',
        // Story modules execute only inside generated runtime; preserve its
        // direct imports even when reusable standalone UI never imports them.
        'src/app/components/story/GenericMountStory.vue',
        'src/app/components/story/GenericRenderStory.vue',
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
        preserveModulesRoot: 'src/app',
      },
      treeshake: false,
      preserveEntrySignatures: 'strict',
    },
    cssCodeSplit: false,
    minify: false,
  },
})
