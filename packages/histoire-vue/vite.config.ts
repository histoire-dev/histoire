import { createRequire } from 'node:module'
import { defineConfig } from 'vitest/config'

// Workbench SFC regressions reuse the app's declared Vue compiler dependency.
const appRequire = createRequire(new URL('../histoire-app/package.json', import.meta.url))
const { default: vue } = await import(appRequire.resolve('@vitejs/plugin-vue'))

export default defineConfig({
  plugins: [vue(), {
    name: 'standalone-command-test-modules',
    /** Actual command adapter imports metadata supplied by inline test mock factories. */
    resolveId(id) {
      if (['virtual:$histoire-commands', 'virtual:$histoire-stories', 'virtual:$histoire-config'].includes(id)) return id
    },
  }],
  // Standalone source is normally compiled under vendor aliases. Adapter unit
  // tests use this package's genuine host router without another Vue runtime.
  resolve: { alias: {
    'vue-router': new URL('./node_modules/vue-router/dist/vue-router.mjs', import.meta.url).pathname,
  } },
  define: { __HISTOIRE_DEV__: 'true' },
  // Behavioral SFC tests do not compile the app's Tailwind presentation bundle.
  css: { postcss: { plugins: [] } },
  test: { environment: 'jsdom', globals: false },
})
