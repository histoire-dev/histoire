import type { McpProject } from '../protocol/project-schema.js'
import { missingBrowserTestDependencies } from '../../test/preflight.js'
import { hasProjectVitest } from '../../util/has-vitest.js'
import { tryResolveDependency } from '../../util/resolve-package.js'

/** Detect optional packages without evaluating Vitest/Playwright or launching browsers. */
export function detectDevMcpCapabilities(root: string): McpProject['capabilities'] {
  const playwright = !!tryResolveDependency(root, 'playwright')
  const testsAvailable = hasProjectVitest(root) && missingBrowserTestDependencies(root).length === 0
  return {
    catalog: true,
    content: true,
    previews: true,
    screenshots: { available: playwright, ...(!playwright ? { reason: 'Install playwright to capture screenshots' } : {}) },
    inspection: { available: playwright, ...(!playwright ? { reason: 'Install playwright to inspect rendered variants' } : {}) },
    tests: {
      available: testsAvailable,
      engine: testsAvailable ? 'project-vitest' : 'unavailable',
      ...(!testsAvailable ? { reason: 'Install vitest, @vitest/browser-playwright and playwright to run browser tests' } : {}),
    },
  }
}
