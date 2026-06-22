import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { globbySync } from 'globby'
import { defineConfig } from 'vite'
import pkg from './package.json'

const packageRoot = fileURLToPath(new URL('.', import.meta.url))
const sourceRoot = fileURLToPath(new URL('src', import.meta.url))

export default defineConfig({
  root: packageRoot,

  plugins: [
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
          const files = globbySync('dist/**/*.js', {
            absolute: true,
            cwd: packageRoot,
          })
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
    outDir: 'dist/bundled',
    lib: {
      entry: '',
      formats: ['es'],
    },
    rolldownOptions: {
      external: [
        ...Object.keys(pkg.dependencies).map(dep => new RegExp(`^${dep}(\\/?)`)),
        ...Object.keys(pkg.peerDependencies).map(dep => new RegExp(`^${dep}(\\/?)`)),
        /\$histoire/,
        /@histoire/,
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
        preserveModulesRoot: sourceRoot,
      },
      treeshake: false,
      preserveEntrySignatures: 'strict',
    },
  },
})
