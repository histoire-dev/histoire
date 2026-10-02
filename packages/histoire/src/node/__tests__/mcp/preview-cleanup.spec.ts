import type { Browser } from 'playwright'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { closePreviewBrowser } from '../../mcp/browser/cleanup.js'
import * as kill from '../../util/playwright-kill.js'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('confirmed owned preview cleanup', () => {
  it('returns only after graceful browser close resolves', async () => {
    const close = vi.fn(async () => {})
    await expect(closePreviewBrowser({ close } as unknown as Browser)).resolves.toBe('graceful')
    expect(close).toHaveBeenCalledOnce()
  })

  it('requires observed process exit after force kill rather than trusting signal success', async () => {
    vi.useFakeTimers()
    vi.spyOn(kill, 'getPlaywrightBrowserProcess').mockReturnValue({ pid: 123 })
    const force = vi.spyOn(kill, 'forceKillPlaywrightBrowser').mockReturnValue(true)
    const processProbe = vi.spyOn(process, 'kill').mockImplementation(() => {
      throw Object.assign(new Error('gone'), { code: 'ESRCH' })
    })
    const cleanup = closePreviewBrowser({ close: () => new Promise(() => {}) } as unknown as Browser, 40)
    await vi.advanceTimersByTimeAsync(20)
    await expect(cleanup).resolves.toBe('forced')
    expect(force).toHaveBeenCalledOnce()
    expect(processProbe).toHaveBeenCalledWith(123, 0)
  })

  it('rejects unknown browser ownership so execution lane stays unavailable', async () => {
    vi.useFakeTimers()
    vi.spyOn(kill, 'getPlaywrightBrowserProcess').mockReturnValue(undefined)
    vi.spyOn(kill, 'forceKillPlaywrightBrowser').mockReturnValue(false)
    const cleanup = closePreviewBrowser({ close: () => new Promise(() => {}) } as unknown as Browser, 40)
    const checked = expect(cleanup).rejects.toMatchObject({ code: 'CLEANUP_UNCONFIRMED' })
    await vi.advanceTimersByTimeAsync(50)
    await checked
  })

  it('force kills captured owned process after graceful signal was already sent', () => {
    const signal = vi.spyOn(process, 'kill').mockReturnValue(true)
    const browser = {}
    expect(kill.forceKillPlaywrightBrowser(browser, { pid: 456, killed: true })).toBe(true)
    expect(signal).toHaveBeenCalledWith(-456, 'SIGKILL')
    expect(kill.forceKillPlaywrightBrowser(browser, { pid: 456 })).toBe(false)
  })
})
