import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PreviewError } from '../runtime/browser/errors.js'
import { asPlaywrightBrowser, createBrowserSetupCandidate as candidate, createBrowserSetupOwnerFixture } from './utils/browser-setup.js'
import { deferred } from './utils/mcp/deferred.js'
import { createNeutralBrowserFixture } from './utils/mcp/preview-browser.js'
import { createPreviewPng } from './utils/mcp/preview-png.js'

const mocked = vi.hoisted(() => ({ resolveDriver: vi.fn(), discoverCandidates: vi.fn() }))

vi.mock('../runtime/browser/setup/driver.js', () => ({ resolveBrowserSetupDriver: mocked.resolveDriver }))
vi.mock('../runtime/browser/setup/candidates.js', async importOriginal => ({ ...(await importOriginal() as object), discoverBrowserCandidates: mocked.discoverCandidates }))

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('progressive screenshot browser acquisition', () => {
  it('probes and returns first working candidate without launching heavier choices', async () => {
    const selected = createNeutralBrowserFixture()
    const launch = vi.fn(async () => asPlaywrightBrowser(selected.browser))
    const fixture = createBrowserSetupOwnerFixture({ launch })
    mocked.resolveDriver.mockResolvedValue({ status: 'available', driver: fixture.driver })
    mocked.discoverCandidates.mockResolvedValue([
      candidate('headless-shell', 'unknown', { headless: true }),
      candidate('chromium', 'present', { headless: true, channel: 'chromium' }),
      candidate('chrome', 'present', { headless: true, channel: 'chrome' }),
    ])
    const setup = fixture.owner

    const lease = await setup.acquire(new AbortController().signal, Date.now() + 2_000)

    expect(launch).toHaveBeenCalledOnce()
    expect(launch).toHaveBeenCalledWith(expect.objectContaining({ headless: true, timeout: expect.any(Number) }))
    expect(lease).toMatchObject({ source: 'headless-shell' })
    expect(lease.browser).toBe(selected.browser)
    expect(selected.page.goto).toHaveBeenCalledWith('about:blank', expect.any(Object))
    expect(selected.page.screenshot).toHaveBeenCalledOnce()
    expect(selected.context.close).toHaveBeenCalledOnce()
    expect(setup.getSnapshot()).toMatchObject({ state: 'ready', source: 'headless-shell', repairs: [] })
    await lease.release()
    expect(selected.browser.close).toHaveBeenCalledOnce()
    await setup.close()
  })

  it('tries the next present renderer after an exact classified launch failure', async () => {
    const events: string[] = []
    const chrome = createNeutralBrowserFixture()
    const launch = vi.fn(async (options) => {
      const source = options.channel ?? 'headless-shell'
      events.push(`launch-${source}`)
      if (source === 'headless-shell') throw new Error('browserType.launch: \n╔══════════════════════════════════════════════════════════════════════════════════════════════════╗\n║ Host system is missing dependencies to run browsers.                                            ║\n╚══════════════════════════════════════════════════════════════════════════════════════════════════╝')
      return asPlaywrightBrowser(chrome.browser)
    })
    const fixture = createBrowserSetupOwnerFixture({ launch })
    mocked.resolveDriver.mockResolvedValue({ status: 'available', driver: fixture.driver })
    mocked.discoverCandidates.mockResolvedValue([
      candidate('headless-shell', 'unknown', { headless: true }),
      candidate('chromium', 'absent', { headless: true, channel: 'chromium' }),
      candidate('chrome', 'present', { headless: true, channel: 'chrome' }),
      candidate('msedge', 'present', { headless: true, channel: 'msedge' }),
    ])
    const setup = fixture.owner

    const lease = await setup.acquire(new AbortController().signal, Date.now() + 2_000)

    expect(events).toEqual(['launch-headless-shell', 'launch-chrome'])
    expect(launch).toHaveBeenCalledTimes(2)
    expect(lease.browser).toBe(chrome.browser)
    expect(lease.source).toBe('chrome')
    expect(chrome.context.close).toHaveBeenCalledOnce()
    expect(setup.getSnapshot()).toMatchObject({ state: 'ready', source: 'chrome', repairs: [], attempts: [{ source: 'headless-shell', reason: 'system-dependencies' }, { source: 'chromium', reason: 'browser-missing' }] })
    await lease.release()
    await setup.close()
  })

  it('does not classify a neutral probe error as a launch fallback signal', async () => {
    const first = createNeutralBrowserFixture()
    first.page.screenshot.mockRejectedValue(new Error('browserType.launch: Executable doesn\'t exist at /private/browser'))
    const second = createNeutralBrowserFixture()
    const launch = vi.fn()
      .mockResolvedValueOnce(asPlaywrightBrowser(first.browser))
      .mockResolvedValueOnce(asPlaywrightBrowser(second.browser))
    const fixture = createBrowserSetupOwnerFixture({ launch })
    mocked.resolveDriver.mockResolvedValue({ status: 'available', driver: fixture.driver })
    mocked.discoverCandidates.mockResolvedValue([
      candidate('headless-shell', 'unknown', { headless: true }),
      candidate('chrome', 'present', { headless: true, channel: 'chrome' }),
    ])
    const setup = fixture.owner

    await expect(setup.acquire(new AbortController().signal, Date.now() + 2_000)).rejects.toMatchObject({ code: 'BROWSER_UNAVAILABLE' })

    expect(first.context.close).toHaveBeenCalledOnce()
    expect(first.browser.close).toHaveBeenCalledOnce()
    expect(launch).toHaveBeenCalledOnce()
    expect(setup.getSnapshot()).toMatchObject({ state: 'needs-action', reason: 'startup-failed', repairs: [{ id: 'check-setup' }] })
    await setup.close()
  })

  it('keeps explicit executable policy exclusive and omits its private path from setup output', async () => {
    const launch = vi.fn(async () => {
      throw new Error('browserType.launch: Executable doesn\'t exist at /private/project/browser with space')
    })
    const fixture = createBrowserSetupOwnerFixture({ launch, source: 'executable', executablePath: '/private/project/browser with space' })
    mocked.resolveDriver.mockResolvedValue({ status: 'available', driver: fixture.driver })
    mocked.discoverCandidates.mockResolvedValue([candidate('executable', 'present', { headless: true, executablePath: '/private/project/browser with space' })])
    const setup = fixture.owner

    await expect(setup.acquire(new AbortController().signal, Date.now() + 2_000)).rejects.toMatchObject({ code: 'BROWSER_UNAVAILABLE' })

    expect(launch).toHaveBeenCalledOnce()
    expect(setup.getSnapshot()).toMatchObject({ state: 'needs-action', reason: 'browser-missing', attempts: [{ source: 'executable', reason: 'browser-missing' }] })
    expect(JSON.stringify(setup.getSnapshot())).not.toContain('/private/project')
    await setup.close()
  })

  it('requests restart for a changed already-imported driver without launching', async () => {
    mocked.resolveDriver.mockResolvedValue({ status: 'invalid', reason: 'driver-version', packageName: 'playwright-core' })
    const setup = createBrowserSetupOwnerFixture().owner

    await expect(setup.acquire(new AbortController().signal, Date.now() + 2_000)).rejects.toMatchObject({
      code: 'BROWSER_UNAVAILABLE',
      setup: { state: 'needs-action', reason: 'driver-version', repairs: [{ id: 'restart-histoire' }] },
    })

    expect(mocked.discoverCandidates).not.toHaveBeenCalled()
    await setup.close()
  })

  it('stops on an unknown startup failure without guessing a browser install', async () => {
    const launch = vi.fn(async () => {
      throw new Error('/private/cache/browser exited with a private diagnostic')
    })
    const fixture = createBrowserSetupOwnerFixture({ launch })
    mocked.resolveDriver.mockResolvedValue({ status: 'available', driver: fixture.driver })
    mocked.discoverCandidates.mockResolvedValue([
      candidate('headless-shell', 'unknown', { headless: true }),
      candidate('chrome', 'present', { headless: true, channel: 'chrome' }),
    ])
    const setup = fixture.owner

    await expect(setup.acquire(new AbortController().signal, Date.now() + 2_000)).rejects.toBeInstanceOf(PreviewError)

    expect(launch).toHaveBeenCalledOnce()
    expect(setup.getSnapshot()).toMatchObject({ state: 'needs-action', reason: 'startup-failed', attempts: [{ source: 'headless-shell', reason: 'startup-failed' }], repairs: [{ id: 'check-setup' }] })
    expect(JSON.stringify(setup.getSnapshot())).not.toContain('/private/cache')
    await setup.close()
  })

  it('keeps an unknown failure actionable after an earlier classified browser miss', async () => {
    const launch = vi.fn(async (options) => {
      if (options.channel === 'chrome') {
        throw new Error('/private/cache/chrome exited with a private diagnostic')
      }
      throw new Error('browserType.launch: Executable doesn\'t exist at /private/cache/headless-shell')
    })
    const fixture = createBrowserSetupOwnerFixture({ launch })
    mocked.resolveDriver.mockResolvedValue({ status: 'available', driver: fixture.driver })
    mocked.discoverCandidates.mockResolvedValue([
      candidate('headless-shell', 'unknown', { headless: true }),
      candidate('chrome', 'present', { headless: true, channel: 'chrome' }),
      candidate('msedge', 'present', { headless: true, channel: 'msedge' }),
    ])
    const setup = fixture.owner

    await expect(setup.acquire(new AbortController().signal, Date.now() + 2_000)).rejects.toMatchObject({ code: 'BROWSER_UNAVAILABLE' })

    expect(launch).toHaveBeenCalledTimes(2)
    expect(setup.getSnapshot()).toMatchObject({
      state: 'needs-action',
      reason: 'startup-failed',
      attempts: [
        { source: 'headless-shell', reason: 'browser-missing' },
        { source: 'chrome', reason: 'startup-failed' },
      ],
      repairs: [{ id: 'check-setup' }],
    })
    expect(JSON.stringify(setup.getSnapshot())).not.toContain('/private/cache')
    await setup.close()
  })

  it('treats a candidate launch timeout as a retryable operation error', async () => {
    const launch = vi.fn(async () => {
      throw new Error('Timeout 20ms exceeded.')
    })
    const fixture = createBrowserSetupOwnerFixture({ launch })
    mocked.resolveDriver.mockResolvedValue({ status: 'available', driver: fixture.driver })
    mocked.discoverCandidates.mockResolvedValue([
      candidate('headless-shell', 'unknown', { headless: true }),
      candidate('chrome', 'present', { headless: true, channel: 'chrome' }),
    ])
    const setup = fixture.owner

    await expect(setup.acquire(new AbortController().signal, Date.now() + 2_000)).rejects.toMatchObject({ code: 'TIMEOUT' })

    expect(launch).toHaveBeenCalledOnce()
    expect(setup.getSnapshot()).toMatchObject({ state: 'unverified', repairs: [] })
    await setup.close()
  })

  it('releases a browser whose neutral probe completes after cancellation', async () => {
    const screenshot = deferred<Uint8Array>()
    const selected = createNeutralBrowserFixture()
    selected.page.screenshot.mockReturnValue(screenshot.promise)
    const launch = vi.fn(async () => asPlaywrightBrowser(selected.browser))
    const fixture = createBrowserSetupOwnerFixture({ launch })
    mocked.resolveDriver.mockResolvedValue({ status: 'available', driver: fixture.driver })
    mocked.discoverCandidates.mockResolvedValue([candidate('headless-shell', 'unknown', { headless: true })])
    const setup = fixture.owner
    const controller = new AbortController()
    const acquiring = setup.acquire(controller.signal, Date.now() + 2_000)
    await vi.waitFor(() => expect(selected.page.screenshot).toHaveBeenCalledOnce())

    controller.abort()
    screenshot.resolve(createPreviewPng(320, 240))

    await expect(acquiring).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(selected.context.close).not.toHaveBeenCalled()
    expect(selected.browser.close).toHaveBeenCalledOnce()
    expect(setup.getSnapshot().state).not.toBe('ready')
    await setup.close()
  })

  it('does not try another candidate when probe cleanup is unconfirmed', async () => {
    const first = createNeutralBrowserFixture({
      closeContext: async () => {
        throw new Error('context close failed')
      },
    })
    const launch = vi.fn(async () => asPlaywrightBrowser(first.browser))
    const fixture = createBrowserSetupOwnerFixture({ launch })
    mocked.resolveDriver.mockResolvedValue({ status: 'available', driver: fixture.driver })
    mocked.discoverCandidates.mockResolvedValue([
      candidate('headless-shell', 'unknown', { headless: true }),
      candidate('chrome', 'present', { headless: true, channel: 'chrome' }),
    ])
    const setup = fixture.owner

    await expect(setup.acquire(new AbortController().signal, Date.now() + 2_000)).rejects.toMatchObject({ code: 'CLEANUP_UNCONFIRMED' })

    expect(first.browser.close).toHaveBeenCalledOnce()
    expect(launch).toHaveBeenCalledOnce()
    expect(setup.getSnapshot().state).toBe('unverified')
    await expect(setup.close()).rejects.toMatchObject({ code: 'CLEANUP_UNCONFIRMED' })
  })

  it('retries only candidates after a classified failure of the cached source', async () => {
    const first = createNeutralBrowserFixture()
    const edge = createNeutralBrowserFixture()
    const launch = vi.fn()
      .mockResolvedValueOnce(asPlaywrightBrowser(first.browser))
      .mockRejectedValueOnce(new Error('browserType.launch: Executable doesn\'t exist at /private/shell'))
      .mockResolvedValueOnce(asPlaywrightBrowser(edge.browser))
    const fixture = createBrowserSetupOwnerFixture({ launch })
    mocked.resolveDriver.mockResolvedValue({ status: 'available', driver: fixture.driver })
    mocked.discoverCandidates.mockResolvedValue([
      candidate('headless-shell', 'unknown', { headless: true }),
      candidate('chrome', 'present', { headless: true, channel: 'chrome' }),
      candidate('msedge', 'present', { headless: true, channel: 'msedge' }),
    ])
    const setup = fixture.owner

    const firstLease = await setup.acquire(new AbortController().signal, Date.now() + 2_000)
    await firstLease.release()
    const nextLease = await setup.acquire(new AbortController().signal, Date.now() + 2_000)

    expect(launch.mock.calls.map(([options]) => options.channel ?? 'headless-shell')).toEqual(['headless-shell', 'headless-shell', 'chrome'])
    expect(nextLease.source).toBe('chrome')
    expect(setup.getSnapshot().attempts).toEqual([{
      source: 'headless-shell',
      reason: 'browser-missing',
      stage: 'launch',
      driver: { packageName: 'playwright', version: '1.59.1' },
      diagnostic: { code: 'unknown' },
    }])
    await nextLease.release()
    await setup.close()
  })
})
