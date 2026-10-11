import { afterEach, describe, expect, it, vi } from 'vitest'
import { detectDevMcpCapabilities, refreshDevMcpScreenshotCapabilities, withScreenshotSetupHealth } from '../../mcp/project/capabilities.js'
import * as preflight from '../../test/preflight.js'
import * as projectVitest from '../../util/has-vitest.js'
import * as packages from '../../util/resolve-package.js'

describe('mcp package-only availability', () => {
  afterEach(() => vi.restoreAllMocks())

  it('advertises project tests when runner dependency preflight succeeds', () => {
    vi.spyOn(packages, 'tryResolveDependency').mockReturnValue('/project/playwright')
    vi.spyOn(projectVitest, 'hasProjectVitest').mockReturnValue(true)
    vi.spyOn(preflight, 'missingBrowserTestDependencies').mockReturnValue([])
    expect(detectDevMcpCapabilities('/project')).toMatchObject({ screenshots: { available: true }, tests: { available: true, engine: 'project-vitest' } })
  })

  it('reports missing packages rather than claiming installed browser executable', () => {
    vi.spyOn(packages, 'tryResolveDependency').mockReturnValue(null)
    vi.spyOn(projectVitest, 'hasProjectVitest').mockReturnValue(true)
    vi.spyOn(preflight, 'missingBrowserTestDependencies').mockReturnValue(['playwright'])
    expect(detectDevMcpCapabilities('/project')).toMatchObject({ screenshots: { available: false }, tests: { available: false, engine: 'unavailable' } })
    vi.mocked(packages.tryResolveDependency).mockReturnValue('/project/playwright')
    vi.mocked(preflight.missingBrowserTestDependencies).mockReturnValue(['@vitest/browser-playwright'])
    expect(detectDevMcpCapabilities('/project')).toMatchObject({ screenshots: { available: true }, tests: { available: false, engine: 'unavailable' } })
    vi.mocked(preflight.missingBrowserTestDependencies).mockReturnValue([])
    vi.mocked(projectVitest.hasProjectVitest).mockReturnValue(false)
    expect(detectDevMcpCapabilities('/project').tests).toMatchObject({ available: false, engine: 'unavailable' })
  })

  it('admits core-only isolated screenshots without changing Vitest test requirements', () => {
    vi.spyOn(packages, 'tryResolveDependency').mockImplementation((_root, name) => name === 'playwright-core' ? '/project/node_modules/playwright-core/index.js' : null)
    vi.spyOn(projectVitest, 'hasProjectVitest').mockReturnValue(true)
    vi.spyOn(preflight, 'missingBrowserTestDependencies').mockReturnValue(['playwright', '@vitest/browser-playwright'])

    expect(detectDevMcpCapabilities('/project')).toMatchObject({
      screenshots: { available: true },
      inspection: { available: true },
      tests: { available: false, engine: 'unavailable' },
    })
  })

  it('marks screenshots and inspection unavailable only after a completed setup failure', () => {
    vi.spyOn(packages, 'tryResolveDependency').mockReturnValue('/project/node_modules/playwright/index.js')
    const baseline = detectDevMcpCapabilities('/project')

    expect(withScreenshotSetupHealth(baseline, { revision: 2, state: 'checking', attempts: [], repairs: [] }).screenshots.available).toBe(true)
    expect(withScreenshotSetupHealth(baseline, { revision: 3, state: 'needs-action', reason: 'browser-missing', attempts: [], repairs: [] })).toMatchObject({
      screenshots: { available: false, reason: 'Install a supported Chromium browser, then check setup' },
      inspection: { available: false, reason: 'Install a supported Chromium browser, then check setup' },
      tests: { available: baseline.tests.available },
    })
  })

  it('recovers package-only screenshot availability after install and explicit refresh', () => {
    const resolve = vi.spyOn(packages, 'tryResolveDependency').mockReturnValue(null)
    vi.spyOn(projectVitest, 'hasProjectVitest').mockReturnValue(true)
    vi.spyOn(preflight, 'missingBrowserTestDependencies').mockReturnValue(['playwright'])
    const beforeInstall = detectDevMcpCapabilities('/project')
    resolve.mockImplementation((_root, name) => name === 'playwright-core' ? '/project/node_modules/playwright-core/index.js' : null)

    const refreshed = refreshDevMcpScreenshotCapabilities('/project', beforeInstall, { revision: 4, state: 'unverified', attempts: [], repairs: [] })
    expect(refreshed).toMatchObject({ screenshots: { available: true }, inspection: { available: true }, tests: { available: false, engine: 'unavailable' } })
    expect(refreshDevMcpScreenshotCapabilities('/project', beforeInstall, { revision: 5, state: 'ready', source: 'chromium', attempts: [], repairs: [] })).toMatchObject({ screenshots: { available: true }, inspection: { available: true }, tests: { available: false, engine: 'unavailable' } })
    expect(withScreenshotSetupHealth(refreshed, { revision: 6, state: 'needs-action', reason: 'browser-missing', attempts: [], repairs: [] })).toMatchObject({ screenshots: { available: false }, inspection: { available: false }, tests: { available: false, engine: 'unavailable' } })
  })
})
