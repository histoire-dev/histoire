import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ command }) => ({
  plugins: [vue()],
  // Library mode would bake `/` in; the book build must resolve its own base.
  define: command === 'build' ? { 'import.meta.env.BASE_URL': 'import.meta.env.BASE_URL' } : undefined,
  css: { postcss: {} },
  build: {
    target: 'es2022',
    minify: false,
    // `tsc` emits `dist/index.js` alongside; `vite build --watch` must not wipe it on rebuild.
    // `build` script cleans `dist` with `rimraf` instead.
    emptyOutDir: false,
    lib: { formats: ['es'], entry: { client: 'src/client.ts' }, fileName: (_format, name) => `${name}.js` },
    rolldownOptions: { external: id => /^(?:node:|vue(?:\/|$)|@histoire\/)/.test(id), output: { chunkFileNames: 'chunks/[name]-[hash].js' } },
  },
  test: { include: ['src/__tests__/**/*.spec.ts'] },
}))
