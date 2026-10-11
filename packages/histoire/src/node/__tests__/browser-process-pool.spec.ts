import type { Browser } from 'playwright'
import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { closePreviewBrowser } from '../runtime/browser/cleanup.js'
import { createBrowserProcessPool } from '../runtime/browser/setup/pool.js'

/** Browser adapter double drives process-close and disconnect events without launching Chromium. */
function createBrowser(close: () => Promise<unknown> = async () => {}): { browser: Browser, disconnect: () => void, close: ReturnType<typeof vi.fn> } {
  const events = new EventEmitter()
  let connected = true
  const disconnect = () => {
    connected = false
    events.emit('disconnected')
  }
  const closeMock = vi.fn(async () => {
    await close()
    disconnect()
  })
  const browser = {
    on: events.on.bind(events),
    off: events.off.bind(events),
    close: closeMock,
    isConnected: () => connected,
  } as unknown as Browser
  return { browser, disconnect, close: closeMock }
}

/** Resolves a controlled lifecycle event for deterministic close/acquire races. */
function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/**
 * Boundary: execute the real pool state machine; substitute only Playwright's external browser handle.
 * Contract: returned leases reuse one connected process, while close/disconnect outcomes control reuse.
 * Defects covered: returning a closing/disconnected process, duplicate launches, or reuse after uncertain cleanup.
 * Lifetime: tests release each lease or close the pool, including held launch and close promises.
 */
describe('browser process pool', () => {
  it('reuses one browser process across released capture leases until owner close', async () => {
    const fixture = createBrowser()
    const launch = vi.fn(async () => fixture.browser)
    const pool = createBrowserProcessPool({ idleTimeoutMs: 30_000 })

    const first = await pool.acquire(launch)
    expect(first.browser).toBe(fixture.browser)
    await first.release()
    const second = await pool.acquire(launch)

    expect(second.browser).toBe(fixture.browser)
    expect(launch).toHaveBeenCalledOnce()
    expect(fixture.close).not.toHaveBeenCalled()

    await second.release()
    await pool.close()
    expect(fixture.close).toHaveBeenCalledOnce()
  })

  it('closes after the idle lifetime and launches one replacement on the next capture', async () => {
    vi.useFakeTimers()
    const firstBrowser = createBrowser()
    const secondBrowser = createBrowser()
    const firstLaunch = vi.fn(async () => firstBrowser.browser)
    const nextLaunch = vi.fn(async () => secondBrowser.browser)
    const pool = createBrowserProcessPool({ idleTimeoutMs: 1_000 })

    const first = await pool.acquire(firstLaunch)
    await first.release()
    await vi.advanceTimersByTimeAsync(1_000)
    const second = await pool.acquire(nextLaunch)

    expect(firstBrowser.close).toHaveBeenCalledOnce()
    expect(second.browser).toBe(secondBrowser.browser)
    expect(nextLaunch).toHaveBeenCalledOnce()
    await second.release()
    await pool.close()
  })

  it('retires an idle browser immediately and rejects another lease', async () => {
    const fixture = createBrowser()
    const pool = createBrowserProcessPool({ idleTimeoutMs: 30_000 })
    const first = await pool.acquire(async () => fixture.browser)
    await first.release()

    await pool.retire()

    expect(fixture.close).toHaveBeenCalledOnce()
    await expect(pool.acquire(async () => fixture.browser)).rejects.toThrow('retired')
    await pool.close()
  })

  it('keeps an active lease usable across retirement, then closes it on release', async () => {
    const fixture = createBrowser()
    const pool = createBrowserProcessPool({ idleTimeoutMs: 30_000 })
    const lease = await pool.acquire(async () => fixture.browser)

    await pool.retire()

    expect(lease.browser.isConnected()).toBe(true)
    expect(fixture.close).not.toHaveBeenCalled()
    await lease.release()
    expect(fixture.close).toHaveBeenCalledOnce()
    await expect(pool.acquire(async () => fixture.browser)).rejects.toThrow('retired')
    await pool.close()
  })

  it('closes a launch that completes after retirement only when its lease releases', async () => {
    const pending = deferred<Browser>()
    const fixture = createBrowser()
    const pool = createBrowserProcessPool({ idleTimeoutMs: 30_000 })
    const acquiring = pool.acquire(() => pending.promise)

    await pool.retire()
    pending.resolve(fixture.browser)
    const lease = await acquiring

    expect(lease.browser).toBe(fixture.browser)
    expect(fixture.close).not.toHaveBeenCalled()
    await lease.release()
    expect(fixture.close).toHaveBeenCalledOnce()
    await pool.close()
  })

  it('reports idle expiry cleanup failure so owner can quarantine later captures', async () => {
    vi.useFakeTimers()
    const cleanupError = new Error('process close was not confirmed')
    const fixture = createBrowser()
    const onCleanupFailure = vi.fn()
    const closeBrowser = async () => {
      throw cleanupError
    }
    const pool = createBrowserProcessPool({ idleTimeoutMs: 1_000, closeBrowser, onCleanupFailure })
    const lease = await pool.acquire(async () => fixture.browser)
    await lease.release()

    await vi.advanceTimersByTimeAsync(1_000)

    expect(onCleanupFailure).toHaveBeenCalledWith(cleanupError)
    await expect(pool.acquire(async () => createBrowser().browser)).rejects.toBe(cleanupError)
    await expect(pool.close()).rejects.toBe(cleanupError)
  })

  it('waits for an idle close racing acquisition before launching exactly once', async () => {
    vi.useFakeTimers()
    const closing = deferred<unknown>()
    const firstBrowser = createBrowser()
    const nextBrowser = createBrowser()
    const pool = createBrowserProcessPool({
      idleTimeoutMs: 1_000,
      closeBrowser: () => closing.promise,
    })
    const first = await pool.acquire(async () => firstBrowser.browser)
    await first.release()
    await vi.advanceTimersByTimeAsync(1_000)

    const nextLaunch = vi.fn(async () => nextBrowser.browser)
    const acquiring = pool.acquire(nextLaunch)
    await Promise.resolve()
    expect(nextLaunch).not.toHaveBeenCalled()

    closing.resolve(undefined)
    const next = await acquiring
    expect(next.browser).toBe(nextBrowser.browser)
    expect(nextLaunch).toHaveBeenCalledOnce()
    await next.release()
    await pool.close()
  })

  it('drops a disconnected browser and reacquires only for the later explicit request', async () => {
    const firstBrowser = createBrowser()
    const nextBrowser = createBrowser()
    const pool = createBrowserProcessPool({ idleTimeoutMs: 30_000 })
    const first = await pool.acquire(async () => firstBrowser.browser)

    firstBrowser.disconnect()
    await first.release()
    const next = await pool.acquire(async () => nextBrowser.browser)

    expect(next.browser).toBe(nextBrowser.browser)
    expect(firstBrowser.close).toHaveBeenCalledOnce()
    await next.release()
    await pool.close()
  })

  it('rejects a new launch after process cleanup remains unconfirmed', async () => {
    vi.useFakeTimers()
    const stuckBrowser = createBrowser(() => new Promise(() => {}))
    const pool = createBrowserProcessPool({
      idleTimeoutMs: 30_000,
      closeBrowser: browser => closePreviewBrowser(browser, 20),
    })
    const lease = await pool.acquire(async () => stuckBrowser.browser)
    const discarded = lease.discard()
    await vi.advanceTimersByTimeAsync(100)

    await expect(discarded).rejects.toMatchObject({ code: 'CLEANUP_UNCONFIRMED' })
    const replacementLaunch = vi.fn(async () => createBrowser().browser)
    await expect(pool.acquire(replacementLaunch)).rejects.toMatchObject({ code: 'CLEANUP_UNCONFIRMED' })
    expect(replacementLaunch).not.toHaveBeenCalled()
  })

  it('closes a browser that resolves after owner shutdown and rejects its waiting lease', async () => {
    const late = deferred<Browser>()
    const browser = createBrowser()
    const pool = createBrowserProcessPool({ idleTimeoutMs: 30_000 })
    const acquiring = pool.acquire(() => late.promise)
    const closing = pool.close()
    late.resolve(browser.browser)

    await expect(acquiring).rejects.toThrow()
    await closing
    expect(browser.close).toHaveBeenCalledOnce()
  })
})
