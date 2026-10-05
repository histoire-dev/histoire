import { createRequire } from 'node:module'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const postcss = createRequire(import.meta.url)('./postcss.peer.config.cjs')

/** Same control component sources, external host Vue graph and provider-scoped CSS. */
export default defineConfig({
  plugins: [vue()],
  define: { __HISTOIRE_CONTROLS_PEER__: 'true' },
  css: { postcss },
  build: {
    emptyOutDir: false,
    outDir: 'dist/peer',
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: 'index' },
    rollupOptions: { external: [/^vue(?:\/|$)/, /^@vue\//, /^@vueuse\//, /^floating-vue(?:\/|$)/, /^@iconify\//, /^@histoire\//] },
  },
})
