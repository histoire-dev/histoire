import type { Context } from '../context.js'
import { resolve } from 'pathe'
import { describe, expect, it } from 'vitest'
import { normalizeBrowserConfig } from '../config/browser.js'
import { getDefaultConfig } from '../config/defaults.js'
import { processConfig } from '../config/process.js'
import { createBrowserSetupPolicy } from '../runtime/browser/setup/policy.js'
import { resolvedConfig } from '../virtual/resolved-config.js'

describe('browser config', () => {
  it('defaults to auto and preserves explicit renderer selection', () => {
    expect(getDefaultConfig().browser).toEqual({ source: 'auto' })
    expect(normalizeBrowserConfig({ source: 'chrome' }, '/project')).toEqual({ source: 'chrome' })
  })

  it('resolves configured executable paths against project root without splitting spaces', async () => {
    const config = getDefaultConfig()
    config.browser = { source: 'executable', executablePath: 'tools/Google Chrome' }
    const ctx = { config, root: '/project' } as Context

    await processConfig(ctx)

    expect(config.browser).toEqual({ source: 'executable', executablePath: resolve('/project', 'tools/Google Chrome') })
  })

  it('creates one immutable policy with the resolved executable path', () => {
    const policy = createBrowserSetupPolicy({ source: 'executable', executablePath: 'tools/Google Chrome' }, '/project')

    expect(policy).toEqual({ source: 'executable', executablePath: resolve('/project', 'tools/Google Chrome') })
    expect(Object.isFrozen(policy)).toBe(true)
  })

  it('keeps process reuse opt-in and supplies the documented idle lifetime only when enabled', () => {
    expect(createBrowserSetupPolicy({ source: 'chrome' }, '/project')).toEqual({ source: 'chrome' })
    expect(createBrowserSetupPolicy({ source: 'chrome', reuse: false }, '/project')).toEqual({ source: 'chrome' })
    expect(normalizeBrowserConfig({ source: 'chrome', reuse: true }, '/project')).toEqual({ source: 'chrome', reuse: true })
    expect(createBrowserSetupPolicy({ source: 'chrome', reuse: true }, '/project')).toEqual({ source: 'chrome', reuse: true, idleTimeoutMs: 30_000 })
    expect(createBrowserSetupPolicy({ source: 'chrome', reuse: true, idleTimeoutMs: 1_000 }, '/project')).toEqual({ source: 'chrome', reuse: true, idleTimeoutMs: 1_000 })
  })

  it.each([
    [{ source: 'chrome', executablePath: '/usr/bin/chrome' }, 'requires browser.source'],
    [{ source: 'chrome', reuse: 'yes' }, 'browser.reuse must be a boolean'],
    [{ source: 'chrome', idleTimeoutMs: 30_000 }, 'requires browser.reuse to be true'],
    [{ source: 'chrome', reuse: false, idleTimeoutMs: 30_000 }, 'requires browser.reuse to be true'],
    [{ source: 'chrome', reuse: true, idleTimeoutMs: 999 }, 'between 1000 and 300000'],
    [{ source: 'chrome', reuse: true, idleTimeoutMs: 300_001 }, 'between 1000 and 300000'],
    [{ source: 'chrome', reuse: true, idleTimeoutMs: 1_000.5 }, 'an integer'],
    [{ source: 'other' }, 'browser.source'],
    [{ source: 'executable', executablePath: '' }, 'non-empty path'],
    [{ source: 'executable', executablePath: 'https://example.test/chrome' }, 'not a URL'],
    [{ source: 'executable', executablePath: 'pnpm exec playwright install chromium' }, 'not a command'],
    [{ source: 'executable', executablePath: 'chrome --headless' }, 'not a command'],
    [{ source: 'executable', executablePath: '/opt/chrome --headless' }, 'not a command'],
    [{ source: 'executable', executablePath: 'C:\\Program Files\\Chrome\\chrome.exe --headless' }, 'not a command'],
    [{ source: 'executable', executablePath: 'chrome', unexpected: true }, 'unknown option'],
  ] as const)('rejects invalid trusted browser policy %#', (value, expectedMessage) => {
    expect(() => normalizeBrowserConfig(value as any, '/project')).toThrow(expectedMessage)
  })

  it.each(['dev', 'build'] as const)('keeps trusted browser paths out of %s public config', (mode) => {
    const output = resolvedConfig({
      mode,
      config: {
        browser: { source: 'executable', executablePath: '/private/project/Google Chrome' },
        ui: { frameBudget: 12 },
      },
    } as Context)

    expect(output).not.toContain('browser')
    expect(output).not.toContain('/private/project/Google Chrome')
    expect(output).toContain('"frameBudget":12')
  })
})
