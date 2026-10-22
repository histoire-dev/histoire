import { defineConfig } from 'vite'
import { rolldownWatchOptions } from '../../scripts/vite-watch.mjs'
import pkg from './package.json'

/** Keep framework runtimes external so stories and adapters share one instance. */
export default defineConfig({
  build: {
    watch: rolldownWatchOptions('plugin-react'),
    minify: false,
    rolldownOptions: {
      input: ['src/index.ts', 'src/index.node.ts', 'src/client/index.ts', 'src/collect/index.ts'],
      external: [
        ...Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies }).map(dep => new RegExp(`^${dep}(/|$)`)),
        /^node:/,
        /^virtual:/,
      ],
      output: {
        preserveModules: true,
        preserveModulesRoot: 'src',
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
      },
      preserveEntrySignatures: 'strict',
    },
  },
})
