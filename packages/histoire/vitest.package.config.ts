import { configDefaults, defineConfig } from 'vitest/config'
import coreConfig from './vitest.config.js'

/** Explicit local tarball/install gate; never repeated by ordinary unit runs. */
export default defineConfig({
  ...coreConfig,
  test: {
    ...coreConfig.test,
    include: ['src/node/__tests__/mcp/package-smoke.spec.ts'],
    exclude: configDefaults.exclude,
    fileParallelism: false,
    testTimeout: 600_000,
    hookTimeout: 600_000,
  },
})
