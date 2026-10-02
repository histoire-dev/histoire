import { afterEach, describe, expect, it, vi } from 'vitest'
import { detectDevMcpCapabilities } from '../../mcp/project/capabilities.js'
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
})
