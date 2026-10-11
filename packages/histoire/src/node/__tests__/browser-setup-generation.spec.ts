import type { BrowserSetupCandidate } from '../runtime/browser/setup/types.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { asPlaywrightBrowser, createBrowserSetupCandidate as candidate, createBrowserSetupOwnerFixture } from './utils/browser-setup.js'
import { deferred } from './utils/mcp/deferred.js'
import { createNeutralBrowserFixture } from './utils/mcp/preview-browser.js'
import { createPreviewPng } from './utils/mcp/preview-png.js'

const mocked = vi.hoisted(() => ({ resolveDriver: vi.fn(), discoverCandidates: vi.fn() }))

vi.mock('../runtime/browser/setup/driver.js', () => ({ resolveBrowserSetupDriver: mocked.resolveDriver }))
vi.mock('../runtime/browser/setup/candidates.js', async importOriginal => ({ ...(await importOriginal() as object), discoverBrowserCandidates: mocked.discoverCandidates }))

beforeEach(() => vi.clearAllMocks())

/** Resolves whether bounded authority work completed before its dependency does. */
async function settlesWithin(promise: Promise<unknown>, timeoutMs = 250): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise.then(() => true, () => true),
      new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs) }),
    ])
  }
  finally {
    clearTimeout(timer)
  }
}

describe('setup generation ownership', () => {
  it('cancels an acquisition during held driver discovery without cancelling useful metadata discovery', async () => {
    const heldDriver = deferred<any>()
    const launch = vi.fn(async () => {
      throw new Error('Cancelled acquisition must not launch')
    })
    const { owner, driver } = createBrowserSetupOwnerFixture({ launch })
    mocked.resolveDriver.mockReturnValue(heldDriver.promise)
    mocked.discoverCandidates.mockResolvedValue([candidate('headless-shell')])
    const controller = new AbortController()
    const acquisition = owner.acquire(controller.signal, Date.now() + 5_000)
    const outcome = acquisition.then(
      () => ({ state: 'resolved' as const }),
      error => ({ state: 'rejected' as const, error }),
    )
    await vi.waitFor(() => expect(mocked.resolveDriver).toHaveBeenCalledOnce())

    controller.abort()

    try {
      expect(await settlesWithin(outcome)).toBe(true)
      expect(await outcome).toMatchObject({ state: 'rejected', error: { code: 'CANCELLED' } })
      expect(owner.getSnapshot().state).toBe('unverified')
      heldDriver.resolve({ status: 'available', driver })
      await expect(owner.discover()).resolves.toMatchObject({ state: 'unverified' })
      expect(launch).not.toHaveBeenCalled()
    }
    finally {
      heldDriver.resolve({ status: 'available', driver })
      await owner.close()
    }
  })

  it('expires an acquisition deadline during held driver discovery', async () => {
    const heldDriver = deferred<any>()
    const launch = vi.fn(async () => {
      throw new Error('Expired acquisition must not launch')
    })
    const { owner, driver } = createBrowserSetupOwnerFixture({ launch })
    mocked.resolveDriver.mockReturnValue(heldDriver.promise)
    mocked.discoverCandidates.mockResolvedValue([candidate('headless-shell')])
    const acquisition = owner.acquire(new AbortController().signal, Date.now() + 40)
    const outcome = acquisition.then(
      () => ({ state: 'resolved' as const }),
      error => ({ state: 'rejected' as const, error }),
    )
    await vi.waitFor(() => expect(mocked.resolveDriver).toHaveBeenCalledOnce())

    try {
      expect(await settlesWithin(outcome)).toBe(true)
      expect(await outcome).toMatchObject({ state: 'rejected', error: { code: 'TIMEOUT' } })
      expect(owner.getSnapshot().state).toBe('unverified')
      heldDriver.resolve({ status: 'available', driver })
      await expect(owner.discover()).resolves.toMatchObject({ state: 'unverified' })
      expect(launch).not.toHaveBeenCalled()
    }
    finally {
      heldDriver.resolve({ status: 'available', driver })
      await owner.close()
    }
  })

  it('closes while metadata discovery remains held and ignores its late generation result', async () => {
    const heldDriver = deferred<any>()
    const launch = vi.fn(async () => {
      throw new Error('Closed acquisition must not launch')
    })
    const { owner, driver } = createBrowserSetupOwnerFixture({ launch })
    mocked.resolveDriver.mockReturnValue(heldDriver.promise)
    mocked.discoverCandidates.mockResolvedValue([candidate('headless-shell')])
    const metadata = owner.discover()
    const acquisition = owner.acquire(new AbortController().signal, Date.now() + 5_000)
    const outcome = acquisition.then(
      () => ({ state: 'resolved' as const }),
      error => ({ state: 'rejected' as const, error }),
    )
    await vi.waitFor(() => expect(mocked.resolveDriver).toHaveBeenCalledOnce())

    const closing = owner.close()
    try {
      expect(await settlesWithin(closing)).toBe(true)
      await expect(closing).resolves.toBeUndefined()
      expect(await outcome).toMatchObject({ state: 'rejected', error: { code: 'CANCELLED' } })
      const snapshotAtClose = owner.getSnapshot()
      heldDriver.resolve({ status: 'available', driver })
      await expect(metadata).resolves.toEqual(snapshotAtClose)
      expect(owner.getSnapshot()).toEqual(snapshotAtClose)
      expect(mocked.discoverCandidates).not.toHaveBeenCalled()
      expect(launch).not.toHaveBeenCalled()
    }
    finally {
      heldDriver.resolve({ status: 'available', driver })
      await closing
    }
  })

  it('reuses selected source within owner, then probes again after invalidation', async () => {
    const fixtures = [createNeutralBrowserFixture(), createNeutralBrowserFixture(), createNeutralBrowserFixture()]
    let nextFixture = 0
    const launch = vi.fn(async () => asPlaywrightBrowser(fixtures[nextFixture++].browser))
    const fixture = createBrowserSetupOwnerFixture({ launch })
    mocked.resolveDriver.mockResolvedValue({ status: 'available', driver: fixture.driver })
    mocked.discoverCandidates.mockResolvedValue([
      candidate('headless-shell', 'unknown', { headless: true }),
      candidate('chrome', 'present', { headless: true, channel: 'chrome' }),
    ])
    const setup = fixture.owner

    const first = await setup.acquire(new AbortController().signal, Date.now() + 2_000)
    await first.release()
    const second = await setup.acquire(new AbortController().signal, Date.now() + 2_000)
    await second.release()
    expect(mocked.resolveDriver).toHaveBeenCalledOnce()
    expect(launch).toHaveBeenCalledTimes(2)
    expect(nextFixture).toBe(2)
    const priorRevision = setup.getSnapshot().revision
    setup.invalidate()
    expect(setup.getSnapshot()).toMatchObject({ state: 'unverified', revision: priorRevision + 1 })
    const third = await setup.acquire(new AbortController().signal, Date.now() + 2_000)
    expect(mocked.resolveDriver).toHaveBeenCalledTimes(2)
    expect(launch).toHaveBeenCalledTimes(3)
    expect(third.source).toBe('headless-shell')
    expect(fixtures[2].page.screenshot).toHaveBeenCalledOnce()
    await third.release()
    await setup.close()
  })

  it('does not install candidate metadata returned after refresh', async () => {
    const delayedCandidates = deferred<BrowserSetupCandidate[]>()
    const fixture = createNeutralBrowserFixture()
    const launch = vi.fn(async () => asPlaywrightBrowser(fixture.browser))
    const setup = createBrowserSetupOwnerFixture({ launch })
    mocked.resolveDriver.mockResolvedValue({ status: 'available', driver: setup.driver })
    mocked.discoverCandidates
      .mockImplementationOnce(() => delayedCandidates.promise)
      .mockResolvedValueOnce([candidate('chrome')])
    const owner = setup.owner
    const staleDiscovery = owner.discover()
    await vi.waitFor(() => expect(mocked.discoverCandidates).toHaveBeenCalledOnce())

    owner.invalidate()
    await owner.discover()
    delayedCandidates.resolve([candidate('headless-shell')])
    await staleDiscovery
    const lease = await owner.acquire(new AbortController().signal, Date.now() + 2_000)

    expect(lease.source).toBe('chrome')
    expect(launch).toHaveBeenCalledOnce()
    await lease.release()
    await owner.close()
  })

  it('does not publish a stale probe result after refresh but retains its exact lease', async () => {
    const screenshot = deferred<Uint8Array>()
    const fixture = createNeutralBrowserFixture()
    fixture.page.screenshot.mockReturnValue(screenshot.promise)
    const launch = vi.fn(async () => asPlaywrightBrowser(fixture.browser))
    const setup = createBrowserSetupOwnerFixture({ launch })
    const { owner } = setup
    mocked.resolveDriver.mockResolvedValue({ status: 'available', driver: setup.driver })
    mocked.discoverCandidates.mockResolvedValue([candidate('headless-shell'), candidate('chrome')])
    const acquisition = owner.acquire(new AbortController().signal, Date.now() + 2_000)
    await vi.waitFor(() => expect(fixture.page.screenshot).toHaveBeenCalledOnce())

    owner.invalidate()
    const refreshed = owner.getSnapshot()
    expect(refreshed.state).toBe('unverified')
    screenshot.resolve(createPreviewPng(320, 240))
    const lease = await acquisition

    expect(lease.browser).toBe(fixture.browser)
    expect(owner.getSnapshot()).toEqual(refreshed)
    await lease.release()
    expect(fixture.browser.close).toHaveBeenCalledOnce()
    expect(owner.getSnapshot()).toEqual(refreshed)
    expect(launch).toHaveBeenCalledOnce()
    await owner.close()
  })

  it('keeps cleanup failure terminal across release, refresh, and close', async () => {
    const fixture = createNeutralBrowserFixture({
      closeBrowser: async () => {
        throw new Error('close failed')
      },
    })
    const launch = vi.fn(async () => asPlaywrightBrowser(fixture.browser))
    const setup = createBrowserSetupOwnerFixture({ launch })
    const { owner } = setup
    mocked.resolveDriver.mockResolvedValue({ status: 'available', driver: setup.driver })
    mocked.discoverCandidates.mockResolvedValue([candidate('headless-shell'), candidate('chrome')])
    const lease = await owner.acquire(new AbortController().signal, Date.now() + 2_000)

    await expect(lease.release()).rejects.toMatchObject({ code: 'CLEANUP_UNCONFIRMED' })
    owner.invalidate()
    await expect(owner.discover()).rejects.toMatchObject({ code: 'CLEANUP_UNCONFIRMED' })
    await expect(owner.acquire(new AbortController().signal, Date.now() + 2_000)).rejects.toMatchObject({ code: 'CLEANUP_UNCONFIRMED' })
    await expect(owner.close()).rejects.toMatchObject({ code: 'CLEANUP_UNCONFIRMED' })
  })
})
