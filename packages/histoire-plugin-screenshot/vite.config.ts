import { defineConfig } from 'vite'
import pkg from './package.json'

export default defineConfig({
  build: {
    emptyOutDir: false,

    lib: {
      entry: 'src/index.ts',
      formats: [
        'es',
        'cjs',
      ],
      fileName: 'index',
    },

    rollupOptions: {
      external: [
        ...Object.keys(pkg.dependencies),
        ...Object.keys(pkg.peerDependencies),
      ],
    },
  },
})
