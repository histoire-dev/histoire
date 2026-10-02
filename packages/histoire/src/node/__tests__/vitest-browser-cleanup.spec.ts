import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanupVitestBrowserRun } from '../vitest-browser-cleanup.js'

const { terminate } = vi.hoisted(() => ({ terminate: vi.fn(async () => 'forced') }))
vi.mock('../util/playwright-cleanup.js', () => ({ terminatePlaywrightBrowser: terminate }))

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  terminate.mockReset().mockResolvedValue('forced')
})

/** One fake runner captures unique provider ordering without spawning browser processes. */
function runner(provider: { close: () => Promise<void>, browser?: unknown }, close = vi.fn(async () => {})) {
  return { close, projects: [{ browser: { provider } }, { browser: { provider } }] }
}

describe('confirmed Vitest browser cleanup', () => {
  it('closes each provider once before Vitest and reports graceful completion', async () => {
    const order: string[] = []
    const provider = { close: vi.fn(async () => {
      order.push('provider')
    }) }
    const vitest = runner(provider, vi.fn(async () => {
      order.push('vitest')
    }))
    await expect(cleanupVitestBrowserRun(vitest as any, { label: 'Tests', timeoutMs: 100 })).resolves.toEqual({ status: 'graceful' })
    expect(order).toEqual(['provider', 'vitest'])
    expect(provider.close).toHaveBeenCalledOnce()
    expect(terminate).not.toHaveBeenCalled()
  })

  it('includes core workspace provider', async () => {
    const provider = { close: vi.fn(async () => {}) }
    await cleanupVitestBrowserRun({ close: async () => {}, projects: [], coreWorkspaceProject: { browser: { provider } } } as any, { label: 'Collect', timeoutMs: 100 })
    expect(provider.close).toHaveBeenCalledOnce()
  })

  it('reports unreachable cleanup as unconfirmed', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const vitest = runner({ close: async () => {} }, vi.fn(() => new Promise(() => {})))
    const pending = cleanupVitestBrowserRun(vitest as any, { label: 'Tests', timeoutMs: 100 })
    await vi.advanceTimersByTimeAsync(100)
    await expect(pending).resolves.toEqual({ status: 'unconfirmed' })
    expect(terminate).not.toHaveBeenCalled()
  })

  it('captures browser before provider clears it, and requires Vitest cleanup after confirmed exit', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const browser = {}
    let release!: () => void
    const provider = { browser: browser as unknown, close: vi.fn(() => {
      provider.browser = undefined
      return new Promise<void>((done) => {
        release = done
      })
    }) }
    terminate.mockImplementationOnce(async () => {
      release()
      return 'forced'
    })
    const vitest = runner(provider)
    const pending = cleanupVitestBrowserRun(vitest as any, { label: 'Tests', timeoutMs: 100 })
    await vi.advanceTimersByTimeAsync(100)
    await expect(pending).resolves.toEqual({ status: 'forced' })
    expect(terminate).toHaveBeenCalledWith(browser, 100, undefined)
    expect(vitest.close).toHaveBeenCalledOnce()
  })

  it('does not claim lane cleanup from confirmed browser exit when Vitest remains stuck', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const vitest = runner({ browser: {}, close: async () => {} }, vi.fn(() => new Promise(() => {})))
    const pending = cleanupVitestBrowserRun(vitest as any, { label: 'Tests', timeoutMs: 100 })
    await vi.advanceTimersByTimeAsync(200)
    await expect(pending).resolves.toEqual({ status: 'unconfirmed' })
  })

  it('propagates provider/Vitest cleanup rejection for strict caller to classify', async () => {
    const vitest = runner({ close: async () => {
      throw new Error('provider close failed')
    } })
    await expect(cleanupVitestBrowserRun(vitest as any, { label: 'Tests', timeoutMs: 100 })).rejects.toThrow('provider close failed')
    expect(vitest.close).not.toHaveBeenCalled()
  })
})
