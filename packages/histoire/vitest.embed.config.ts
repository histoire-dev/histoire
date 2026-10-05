import { configDefaults, defineConfig } from 'vitest/config'
import coreConfig from './vitest.config.js'

/** Real frame origins/processes are explicit, separate from default unit tests. */
export default defineConfig({
  ...coreConfig,
  test: {
    ...coreConfig.test,
    include: ['src/node/__tests__/embed/integration/**/*.spec.ts'],
    exclude: configDefaults.exclude,
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
})
