import { configDefaults, defineConfig } from 'vitest/config'
import coreConfig from './vitest.config.js'

/** Real token runtime and static deployment acceptance remains an explicit suite. */
export default defineConfig({
  ...coreConfig,
  test: {
    ...coreConfig.test,
    include: ['src/node/__tests__/tailwind/integration/**/*.spec.ts'],
    exclude: configDefaults.exclude,
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
})
