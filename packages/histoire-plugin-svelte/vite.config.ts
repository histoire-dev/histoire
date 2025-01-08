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
          const files = globbySync('./dist/**/*.js')
          for (const file of files) {
            const content = fs.readFileSync(file, 'utf-8')
            if (content.includes('import__dyn')) {
              fs.writeFileSync(file, content.replace(/import__dyn\(/g, 'import(/* @vite-ignore */'), 'utf-8')
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
