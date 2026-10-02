import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolvePreviewBrowser } from '../../mcp/browser/dependencies.js'
import * as imports from '../../util/import-resolved.js'
import * as packages from '../../util/resolve-package.js'

afterEach(() => vi.restoreAllMocks())

describe('optional preview browser dependency', () => {
  it('reports missing peer without launch or browser installation', async () => {
    const resolve = vi.spyOn(packages, 'tryResolveDependency').mockReturnValue(null)
    const load = vi.spyOn(imports, 'importResolvedModule')
    await expect(resolvePreviewBrowser('/target/project')).rejects.toMatchObject({ code: 'DEPENDENCY_MISSING', message: 'Install playwright in project: pnpm add -D playwright' })
    expect(resolve).toHaveBeenCalledWith('/target/project', 'playwright')
    expect(load).not.toHaveBeenCalled()
  })

  it('imports project-resolved peer and maps launch failure to actionable browser error', async () => {
    vi.spyOn(packages, 'tryResolveDependency').mockReturnValue('/target/project/playwright/index.mjs')
    const launch = vi.fn(async () => {
      throw new Error('/secret/browser/cache missing')
    })
    const load = vi.spyOn(imports, 'importResolvedModule').mockResolvedValue({ chromium: { launch } })
    const resolved = await resolvePreviewBrowser('/target/project')
    expect(launch).not.toHaveBeenCalled()
    await expect(resolved({ headless: true })).rejects.toMatchObject({ code: 'BROWSER_UNAVAILABLE', message: 'Chromium could not launch. Install browser with: pnpm exec playwright install chromium' })
    expect(load).toHaveBeenCalledWith('/target/project/playwright/index.mjs')
  })

  it('accepts CommonJS Playwright default export selected by require.resolve', async () => {
    vi.spyOn(packages, 'tryResolveDependency').mockReturnValue('/target/playwright/index.js')
    const browser = { close: async () => {} }
    const launch = vi.fn(async () => browser)
    vi.spyOn(imports, 'importResolvedModule').mockResolvedValue({ default: { chromium: { launch } } })
    await expect((await resolvePreviewBrowser('/target'))({ headless: true })).resolves.toBe(browser)
  })
})
