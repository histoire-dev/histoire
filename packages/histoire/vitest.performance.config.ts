import { configDefaults, defineConfig } from 'vitest/config'
import coreConfig from './vitest.config.js'

/** Dedicated evidence run, separate from correctness suites and hard CI budgets. */
export default defineConfig({
  ...coreConfig,
  test: {
    ...coreConfig.test,
    include: ['src/node/__tests__/embed/performance/*.performance.ts'],
    exclude: configDefaults.exclude,
    fileParallelism: false,
    testTimeout: 600_000,
    hookTimeout: 600_000,
  },
})
