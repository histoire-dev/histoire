import type { ScreenshotSetupSnapshot } from '@histoire/shared'
import type { McpProject } from '../protocol/project-schema.js'
import { missingBrowserTestDependencies } from '../../test/preflight.js'
import { hasProjectVitest } from '../../util/has-vitest.js'
import { tryResolveDependency } from '../../util/resolve-package.js'

/** Detect optional packages without evaluating Vitest/Playwright or launching browsers. */
export function detectDevMcpCapabilities(root: string): McpProject['capabilities'] {
  const browserDriver = !!tryResolveDependency(root, 'playwright') || !!tryResolveDependency(root, 'playwright-core')
  const testsAvailable = hasProjectVitest(root) && missingBrowserTestDependencies(root).length === 0
  return {
    catalog: true,
    content: true,
    previews: true,
    screenshots: { available: browserDriver, ...(!browserDriver ? { reason: 'Install playwright or playwright-core to capture screenshots' } : {}) },
    inspection: { available: browserDriver, ...(!browserDriver ? { reason: 'Install playwright or playwright-core to inspect rendered variants' } : {}) },
    tests: {
      available: testsAvailable,
      engine: testsAvailable ? 'project-vitest' : 'unavailable',
      ...(!testsAvailable ? { reason: 'Install vitest, @vitest/browser-playwright and playwright to run browser tests' } : {}),
    },
  }
}

const setupReasonMessage = {
  'driver-missing': 'Install a supported Playwright driver to capture screenshots',
  'driver-invalid': 'Fix the Playwright driver and restart Histoire',
  'browser-missing': 'Install a supported Chromium browser, then check setup',
  'driver-version': 'Restart Histoire to load the updated Playwright driver',
  'system-dependencies': 'Install missing Chromium system dependencies',
  'permission': 'Check browser executable permissions',
  'unsupported-platform': 'Screenshot capture is unsupported on this platform',
  'startup-failed': 'Browser startup failed; check screenshot setup',
} satisfies Record<NonNullable<ScreenshotSetupSnapshot['reason']>, string>

/** Reflects a completed setup failure without changing project-test prerequisites. */
export function withScreenshotSetupHealth(capabilities: McpProject['capabilities'], setup: ScreenshotSetupSnapshot): McpProject['capabilities'] {
  if (setup.state === 'ready') {
    return {
      ...capabilities,
      screenshots: { available: true },
      ...(capabilities.inspection ? { inspection: { available: true } } : {}),
    }
  }
  if (setup.state !== 'needs-action' || !setup.reason) return capabilities
  const reason = setupReasonMessage[setup.reason]
  return {
    ...capabilities,
    screenshots: { ...capabilities.screenshots, available: false, reason },
    ...(capabilities.inspection ? { inspection: { ...capabilities.inspection, available: false, reason } } : {}),
  }
}

/** Refreshes package-only browser potential after user installs a driver. */
export function refreshDevMcpScreenshotCapabilities(root: string, capabilities: McpProject['capabilities'], setup: ScreenshotSetupSnapshot): McpProject['capabilities'] {
  const browserDriver = !!tryResolveDependency(root, 'playwright') || !!tryResolveDependency(root, 'playwright-core')
  const current = {
    ...capabilities,
    screenshots: { available: browserDriver, ...(!browserDriver ? { reason: 'Install playwright or playwright-core to capture screenshots' } : {}) },
    ...(capabilities.inspection ? { inspection: { available: browserDriver, ...(!browserDriver ? { reason: 'Install playwright or playwright-core to inspect rendered variants' } : {}) } } : {}),
  }
  return withScreenshotSetupHealth(current, setup)
}
