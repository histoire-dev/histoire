import { configDefaults, defineConfig } from 'vitest/config'
import coreConfig from './vitest.config.js'

/** Real processes and Chromium run explicitly, once, against built packages. */
export default defineConfig({
  ...coreConfig,
  test: {
    ...coreConfig.test,
    include: ['src/node/__tests__/mcp/integration/**/*.spec.ts'],
    exclude: configDefaults.exclude,
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
})
