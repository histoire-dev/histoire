import { describe, expect, it } from 'vitest'
import { classifyBrowserSetupFailure, createBrowserSetupPreviewError, getBrowserSetupRepairs, serializeScreenshotSetupCommand } from '../runtime/browser/setup/report.js'

describe('safe setup diagnosis and repairs', () => {
  it.each([
    ['system-dependencies', new Error('browserType.launch: \n╔══════════════════════════════════════════════════════════════════════════════════════════════════╗\n║ Host system is missing dependencies to run browsers.                                            ║\n╚══════════════════════════════════════════════════════════════════════════════════════════════════╝')],
    ['driver-version', new Error('browserType.launch: Unknown channel "chromium"')],
    ['unsupported-platform', new Error('browserType.launch: Chromium distribution \'chrome\' is not supported on aix')],
    ['browser-missing', new Error('browserType.launch: Chromium distribution \'msedge\' is not found at /private/browser')],
    ['permission', new Error('browserType.launch: Failed to launch: Error: spawn /private/browser EACCES')],
  ] as const)('classifies the audited Playwright error as %s', (reason, error) => {
    expect(classifyBrowserSetupFailure(error)).toBe(reason)
  })

  it('keeps unrecognized launch failures out of repair classification', () => {
    expect(classifyBrowserSetupFailure(new Error('browserType.launch: unknown private launcher failure'))).toBeUndefined()
  })

  it('offers selected-driver upgrade for legacy default Chromium without shell flags', () => {
    const [repair] = getBrowserSetupRepairs('browser-missing', { source: 'auto' }, 'playwright-core', 'linux', '1.48.0')
    expect(repair).toMatchObject({
      id: 'upgrade-playwright',
      command: { executable: 'pnpm', args: ['add', '-D', 'playwright-core@latest'] },
    })
    expect(serializeScreenshotSetupCommand(repair.command!)).toBe('pnpm add -D playwright-core@latest')
    expect(repair.command?.args).not.toContain('--only-shell')
    expect(repair.command?.args).not.toContain('--no-shell')
  })

  it('surfaces the repair command in setup failure messages', () => {
    const repairs = getBrowserSetupRepairs('browser-missing', { source: 'auto' }, 'playwright', 'linux', '1.50.0')
    const error = createBrowserSetupPreviewError('browser-missing', { revision: 1, state: 'needs-action', reason: 'browser-missing', attempts: [], repairs })
    expect(error).toMatchObject({ code: 'BROWSER_UNAVAILABLE', setup: { repairs } })
    expect(error.message).toContain('pnpm exec playwright install chromium --only-shell')
  })

  it('asks for restart when package metadata changed behind a loaded driver', () => {
    expect(getBrowserSetupRepairs('driver-version', { source: 'auto' })).toMatchObject([{ id: 'restart-histoire' }])
  })
})
