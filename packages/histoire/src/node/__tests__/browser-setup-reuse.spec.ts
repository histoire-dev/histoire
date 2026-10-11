import type { BrowserSetupDriver } from '../runtime/browser/setup/types.js'
import type { ExecutionError } from '../runtime/execution-types.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveNodeBrowserPolicy } from '../deploy/options.js'
import { createScreenshotSetupOwner } from '../runtime/browser/setup/owner.js'
import { acquireCandidateBrowser, createBrowserReuseManager } from '../runtime/browser/setup/reuse.js'
import { asPlaywrightBrowser, createBrowserSetupCandidate, createBrowserSetupDriver } from './utils/browser-setup.js'
import { deferred } from './utils/mcp/deferred.js'
import { createNeutralBrowserFixture } from './utils/mcp/preview-browser.js'

const mocked = vi.hoisted(() => ({ resolveDriver: vi.fn(), discoverCandidates: vi.fn() }))

vi.mock('../runtime/browser/setup/driver.js', () => ({ resolveBrowserSetupDriver: mocked.resolveDriver }))
vi.mock('../runtime/browser/setup/candidates.js', async importOriginal => ({ ...(await importOriginal() as object), discoverBrowserCandidates: mocked.discoverCandidates }))

beforeEach(() => vi.clearAllMocks())
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** Builds an opt-in owner around one real candidate/probe path and controlled browser handles. */
function createReuseOwner(launch: BrowserSetupDriver['chromium']['launch'], idleTimeoutMs = 30_000) {
  const driver = createBrowserSetupDriver(launch)
  mocked.resolveDriver.mockResolvedValue({ status: 'available', driver })
  mocked.discoverCandidates.mockResolvedValue([createBrowserSetupCandidate('headless-shell')])
  return createScreenshotSetupOwner({ root: '/project', policy: { source: 'auto', reuse: true, idleTimeoutMs } })
}

describe('optional screenshot browser reuse', () => {
  it('keeps Node deployment process reuse disabled despite unknown reuse environment flags', () => {
    expect(resolveNodeBrowserPolicy({ HISTOIRE_BROWSER_SOURCE: 'chrome', HISTOIRE_BROWSER_REUSE: 'true', HISTOIRE_BROWSER_IDLE_TIMEOUT_MS: '1000' }, '/artifact')).toEqual({ source: 'chrome' })
  })

  it('retains one tested process across captures and closes it with its owner', async () => {
    const browser = createNeutralBrowserFixture()
    const launch = vi.fn(async () => asPlaywrightBrowser(browser.browser))
    const owner = createReuseOwner(launch)

    const first = await owner.acquire(new AbortController().signal, Date.now() + 2_000)
    await first.release()
    expect(browser.browser.close).not.toHaveBeenCalled()

    const second = await owner.acquire(new AbortController().signal, Date.now() + 2_000)
    expect(second.browser).toBe(first.browser)
    expect(launch).toHaveBeenCalledOnce()
    expect(browser.page.screenshot).toHaveBeenCalledOnce()
    await second.release()
    await owner.close()

    expect(browser.browser.close).toHaveBeenCalledOnce()
  })

  it('retires idle processes on refresh and keeps an active lease usable until release', async () => {
    const firstBrowser = createNeutralBrowserFixture()
    const secondBrowser = createNeutralBrowserFixture()
    const launch = vi.fn()
      .mockResolvedValueOnce(asPlaywrightBrowser(firstBrowser.browser))
      .mockResolvedValueOnce(asPlaywrightBrowser(secondBrowser.browser))
    const owner = createReuseOwner(launch)

    const active = await owner.acquire(new AbortController().signal, Date.now() + 2_000)
    owner.invalidate()
    expect(firstBrowser.browser.close).not.toHaveBeenCalled()
    expect(active.browser.isConnected()).toBe(true)
    await active.release()
    expect(firstBrowser.browser.close).toHaveBeenCalledOnce()

    const refreshed = await owner.acquire(new AbortController().signal, Date.now() + 2_000)
    expect(refreshed.browser).toBe(secondBrowser.browser)
    expect(launch).toHaveBeenCalledTimes(2)
    await refreshed.release()
    await owner.close()
    expect(secondBrowser.browser.close).toHaveBeenCalledOnce()
  })

  it('discards a suspect reused process instead of returning it to the idle pool', async () => {
    const firstBrowser = createNeutralBrowserFixture()
    const secondBrowser = createNeutralBrowserFixture()
    const launch = vi.fn()
      .mockResolvedValueOnce(asPlaywrightBrowser(firstBrowser.browser))
      .mockResolvedValueOnce(asPlaywrightBrowser(secondBrowser.browser))
    const owner = createReuseOwner(launch)

    const suspect = await owner.acquire(new AbortController().signal, Date.now() + 2_000)
    await suspect.discard?.()
    expect(firstBrowser.browser.close).toHaveBeenCalledOnce()

    const replacement = await owner.acquire(new AbortController().signal, Date.now() + 2_000)
    expect(replacement.browser).toBe(secondBrowser.browser)
    expect(launch).toHaveBeenCalledTimes(2)
    await replacement.release()
    await owner.close()
  })

  it('clears cached setup proof after an unexpected disconnect without replaying capture', async () => {
    const firstBrowser = createNeutralBrowserFixture()
    const secondBrowser = createNeutralBrowserFixture()
    const launch = vi.fn()
      .mockResolvedValueOnce(asPlaywrightBrowser(firstBrowser.browser))
      .mockResolvedValueOnce(asPlaywrightBrowser(secondBrowser.browser))
    const owner = createReuseOwner(launch)
    const active = await owner.acquire(new AbortController().signal, Date.now() + 2_000)

    firstBrowser.disconnect()

    expect(owner.getSnapshot().state).toBe('unverified')
    expect(launch).toHaveBeenCalledOnce()
    await active.release()
    const replacement = await owner.acquire(new AbortController().signal, Date.now() + 2_000)

    expect(replacement.browser).toBe(secondBrowser.browser)
    expect(launch).toHaveBeenCalledTimes(2)
    await replacement.release()
    await owner.close()
  })

  it('reports idle cleanup uncertainty and blocks later acquisitions', async () => {
    vi.useFakeTimers()
    const browser = createNeutralBrowserFixture()
    const cleanupError = new Error('idle process close was not confirmed')
    const onCleanupFailure = vi.fn()
    const launch = vi.fn(async () => asPlaywrightBrowser(browser.browser))
    const manager = createBrowserReuseManager({
      idleTimeoutMs: 1_000,
      closeBrowser: async () => { throw cleanupError },
      onCleanupFailure,
    })
    const lease = await manager.acquire('revision-one', launch)
    await lease.release()

    await vi.advanceTimersByTimeAsync(1_000)

    expect(onCleanupFailure).toHaveBeenCalledWith(cleanupError)
    const replacement = vi.fn(async () => asPlaywrightBrowser(createNeutralBrowserFixture().browser))
    await expect(manager.acquire('revision-one', replacement)).rejects.toBe(cleanupError)
    expect(replacement).not.toHaveBeenCalled()
    await expect(manager.close()).rejects.toBe(cleanupError)
  })

  it('retains real idle cleanup failure in the setup owner across refresh', async () => {
    const browser = createNeutralBrowserFixture({ closeBrowser: () => Promise.reject(new Error('fixture close failed')) })
    const owner = createReuseOwner(async () => asPlaywrightBrowser(browser.browser), 1_000)
    const lease = await owner.acquire(new AbortController().signal, Date.now() + 10_000)
    await lease.release()

    await vi.waitFor(async () => {
      await expect(owner.discover()).rejects.toMatchObject({ code: 'CLEANUP_UNCONFIRMED' })
    }, { interval: 20, timeout: 7_000 })

    const cleanupFailure = await owner.discover().catch(error => error)
    expect(cleanupFailure).toMatchObject<Partial<ExecutionError>>({ code: 'CLEANUP_UNCONFIRMED' })
    owner.invalidate()
    await expect(owner.acquire(new AbortController().signal, Date.now() + 10_000)).rejects.toBe(cleanupFailure)
    await expect(owner.close()).rejects.toBe(cleanupFailure)
  }, 10_000)

  it('stops a cancelled request waiting for an idle process close before a fresh launch', async () => {
    vi.useFakeTimers()
    const closing = deferred<void>()
    const browser = createNeutralBrowserFixture()
    const launch = vi.fn(async () => asPlaywrightBrowser(browser.browser))
    const driver = createBrowserSetupDriver(launch)
    const candidate = createBrowserSetupCandidate('headless-shell')
    const manager = createBrowserReuseManager({ idleTimeoutMs: 1_000, closeBrowser: () => closing.promise })
    const first = await acquireCandidateBrowser({ driver, candidate, signal: new AbortController().signal, deadline: Date.now() + 10_000, isActive: () => true, probe: true, manager, generation: 3 })
    await first.release()
    await vi.advanceTimersByTimeAsync(1_000)

    const controller = new AbortController()
    const acquisition = acquireCandidateBrowser({ driver, candidate, signal: controller.signal, deadline: Date.now() + 10_000, isActive: () => true, probe: false, manager, generation: 3 })

    controller.abort()
    closing.resolve()

    await expect(acquisition).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(launch).toHaveBeenCalledOnce()
    await manager.close()
  })

  it('stops an expired request waiting for an idle process close before a fresh launch', async () => {
    vi.useFakeTimers()
    const closing = deferred<void>()
    const browser = createNeutralBrowserFixture()
    const launch = vi.fn(async () => asPlaywrightBrowser(browser.browser))
    const driver = createBrowserSetupDriver(launch)
    const candidate = createBrowserSetupCandidate('headless-shell')
    const manager = createBrowserReuseManager({ idleTimeoutMs: 1_000, closeBrowser: () => closing.promise })
    const deadline = Date.now() + 2_000
    const first = await acquireCandidateBrowser({ driver, candidate, signal: new AbortController().signal, deadline, isActive: () => true, probe: true, manager, generation: 4 })
    await first.release()
    await vi.advanceTimersByTimeAsync(1_000)

    const acquisition = acquireCandidateBrowser({ driver, candidate, signal: new AbortController().signal, deadline, isActive: () => true, probe: false, manager, generation: 4 })
    vi.setSystemTime(deadline + 1)
    closing.resolve()

    await expect(acquisition).rejects.toMatchObject({ code: 'TIMEOUT' })
    expect(launch).toHaveBeenCalledOnce()
    await manager.close()
  })
})
