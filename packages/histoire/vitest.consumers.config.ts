import { configDefaults, defineConfig } from 'vitest/config'
import coreConfig from './vitest.config.js'

/** Clean tarball consumers run explicitly after final package graph is built. */
export default defineConfig({
  ...coreConfig,
  test: {
    ...coreConfig.test,
    include: ['src/node/__tests__/embed/consumers/**/*.spec.ts'],
    exclude: configDefaults.exclude,
    fileParallelism: false,
    testTimeout: 600_000,
    hookTimeout: 600_000,
  },
})
