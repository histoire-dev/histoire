import type { Plugin } from 'vite'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createAxeEngineModule } from '@histoire/shared/accessibility'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

/** Compile private pinned engine without assigning window.axe. */
function privateAxe(): Plugin {
  const id = '\0histoire-a11y-axe'
  return {
    name: 'histoire-a11y-private-axe',
    resolveId: source => source === 'virtual:histoire-a11y-axe' ? id : undefined,
    load: source => source === id ? createAxeEngineModule(readFileSync(createRequire(import.meta.url).resolve('axe-core'), 'utf8')) : undefined,
  }
}

export default defineConfig(({ command }) => ({
  plugins: [vue(), privateAxe()],
  // Library mode would bake `/` in; the book build must resolve its own base.
  define: command === 'build' ? { 'import.meta.env.BASE_URL': 'import.meta.env.BASE_URL' } : undefined,
  css: { postcss: {} },
  build: {
    target: 'es2022',
    minify: false,
    // `tsc` emits `dist/index.js` alongside; `vite build --watch` must not wipe it on rebuild.
    // `build` script cleans `dist` with `rimraf` instead.
    emptyOutDir: false,
    lib: { formats: ['es'], entry: { client: 'src/client.ts', frame: 'src/frame.ts', test: 'src/test.ts' }, fileName: (_format, name) => `${name}.js` },
    rolldownOptions: { external: id => /^(?:node:|vue(?:\/|$)|@histoire\/)/.test(id), output: { chunkFileNames: 'chunks/[name]-[hash].js' } },
  },
  test: { include: ['src/__tests__/**/*.spec.ts'], exclude: ['src/__tests__/browser.spec.ts'], testTimeout: 30000 },
}))
