import { configDefaults, defineConfig } from 'vitest/config'
import coreConfig from './vitest.config.js'

/** Real browser and subprocess visual acceptance runs separate from default unit tests. */
export default defineConfig({
  ...coreConfig,
  test: {
    ...coreConfig.test,
    include: ['src/node/__tests__/embed/integration/visual-*.spec.ts'],
    exclude: configDefaults.exclude,
    fileParallelism: false,
    testTimeout: 180_000,
    hookTimeout: 120_000,
  },
})
