import { svelte } from '@sveltejs/vite-plugin-svelte'
import fs from 'fs-extra'
import { globbySync } from 'globby'
import { defineConfig } from 'vite'
import pkg from './package.json'

export default defineConfig({
  plugins: [
    svelte(),
    {
      name: 'histoire:preserve:import.dynamic',
      enforce: 'pre',
      transform(code) {
        if (code.includes('import(')) {
          return {
            code: code.replace(/import\(/g, 'import__dyn('),
          }
        }
      },
      closeBundle() {
        try {
          const rawSvelteFiles = globbySync([
            'src/client/**/*.svelte',
            'src/collect/**/*.svelte',
          ])
          const rawSvelteBasenames = rawSvelteFiles.map(file => file.split('/').pop()?.replace(/\.svelte$/, '')).filter(Boolean)

          for (const file of rawSvelteFiles) {
            const target = file.replace(/^src\//, 'dist/')
            fs.ensureDirSync(target.replace(/\/[^/]+$/, ''))
            fs.copyFileSync(file, target)
          }

          const files = globbySync('./dist/**/*.js')
          for (const file of files) {
            let content = fs.readFileSync(file, 'utf-8')
            let updated = false

            if (content.includes('import__dyn')) {
              content = content.replace(/import__dyn\(/g, 'import(/* @vite-ignore */')
              updated = true
            }

            if (content.includes('.svelte.js')) {
              content = content.replace(/\.svelte\.js(["'])/g, '.svelte$1')
              updated = true
            }

            for (const basename of rawSvelteBasenames) {
              const compiledImport = `./${basename}.js`
              if (content.includes(compiledImport)) {
                content = content.replaceAll(compiledImport, `./${basename}.svelte`)
                updated = true
              }
            }

            if (updated) {
              fs.writeFileSync(file, content, 'utf-8')
            }
          }
        }
        catch (e) {
          console.error(e)
        }
      },
    },
  ],
  build: {
    emptyOutDir: false,
    outDir: 'dist',
    cssCodeSplit: false,
    rollupOptions: {
      external: [
        ...Object.keys(pkg.dependencies).map(dep => new RegExp(`^${dep}(\\/?)`)),
        ...Object.keys(pkg.peerDependencies).map(dep => new RegExp(`^${dep}(\\/?)`)),
        /^node:/,
        /^virtual:/,
        /^\$/, // Virtual modules
      ],

      input: [
        'src/client/index.ts',
        'src/collect/index.ts',
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
