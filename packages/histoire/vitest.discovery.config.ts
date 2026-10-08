import { defineConfig } from 'vitest/config'
import integration from './vitest.mcp.config.js'

/** Fresh source pages and fixture-owned caches are explicit performance delivery gate. */
export default defineConfig({ ...integration, test: { ...integration.test, include: ['src/node/__tests__/mcp/integration/test-discovery-performance.spec.ts'], env: { HISTOIRE_DEV: 'true' } } })
