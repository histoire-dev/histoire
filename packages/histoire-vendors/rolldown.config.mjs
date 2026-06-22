import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'
import { entries } from './entries.js'

const vendorPackages = [
  '@iconify/vue',
  '@vueuse/core',
  'floating-vue',
  'pinia',
  'scroll-into-view-if-needed',
  'vue',
  'vue-router',
]

const resolveOptions = {
  conditionNames: ['import', 'browser', 'module', 'default'],
  mainFields: ['browser', 'module', 'main'],
}

const outputOptions = {
  format: 'es',
  exports: 'auto',
  entryFileNames: '[name].js',
  chunkFileNames: '[name].js',
  assetFileNames: '[name][extname]',
  hoistTransitiveImports: false,
  dir: 'dist/client',
}

const definePlugin = {
  name: 'define',
  transform(code) {
    return code.replace(/__VUE_OPTIONS_API__/g, 'true')
  },
}

export default defineConfig([{
  input: entries,
  platform: 'browser',
  resolve: resolveOptions,

  plugins: [
    definePlugin,
  ],

  output: outputOptions,

  external: [],

  treeshake: false,
  preserveEntrySignatures: 'strict',
}, {
  input: entries,
  platform: 'browser',
  resolve: resolveOptions,

  plugins: [
    dts({
      emitDtsOnly: true,
      compilerOptions: {
        rootDir: 'src/client',
      },
    }),
  ],

  output: outputOptions,

  external: vendorPackages,

  treeshake: false,
  preserveEntrySignatures: 'strict',
}])
