import { defineConfig } from 'rollup'
import ts from 'rollup-plugin-typescript2'
import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import { entries } from './entries.js'

export default defineConfig({
  input: entries,

  plugins: [
    resolve({ preferBuiltins: true }),
    commonjs(),
    ts({
      check: false,
      tsconfigOverride: {
        compilerOptions: {
          rootDir: 'src/client',
        },
      },
    }),
  ],

  output: {
    format: 'es',
    exports: 'auto',
    entryFileNames: '[name].js',
    chunkFileNames: '[name].js',
    assetFileNames: '[name][extname]',
    hoistTransitiveImports: false,
    dir: 'dist/client',
  },

  external: [],

  treeshake: false,
  preserveEntrySignatures: 'strict',
})
