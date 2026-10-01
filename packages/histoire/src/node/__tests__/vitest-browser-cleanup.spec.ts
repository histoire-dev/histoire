import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanupVitestBrowserRun } from '../vitest-browser-cleanup.js'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/**
 * Creates a lightweight Vitest browser runner stub for cleanup tests.
 */
function createVitest(options: {
  provider?: {
    close: ReturnType<typeof vi.fn>
  }
  close?: ReturnType<typeof vi.fn>
  projects?: any[]
  coreWorkspaceProject?: any
}) {
  return {
    close: options.close ?? vi.fn(async () => {}),
    projects: options.projects ?? [],
    coreWorkspaceProject: options.coreWorkspaceProject,
  }
}

/**
 * Creates a Playwright browser handle stub exposing the same internals the
 * hard-kill fallback walks: the in-process client connection maps the client
 * object back to its server implementation, which owns the spawned process.
 * @param pid Process id of the fake spawned browser.
 */
function createPlaywrightBrowser(pid: number) {
  const browser: any = {}
  browser._connection = {
    toImpl: (target: unknown) => (target === browser
      ? { options: { browserProcess: { process: { pid } } } }
      : undefined),
  }
  return browser
}

describe('cleanupVitestBrowserRun', () => {
  it('closes each browser provider once before closing Vitest', async () => {
    const closeOrder: string[] = []
    const provider = {
      close: vi.fn(async () => {
        closeOrder.push('provider')
      }),
    }
    const vitest = createVitest({
      provider,
      close: vi.fn(async () => {
        closeOrder.push('vitest')
      }),
      projects: [
        { browser: { provider } },
        { browser: { provider } },
      ],
    })

    await cleanupVitestBrowserRun(vitest as any, {
      label: 'Histoire tests',
      timeoutMs: 100,
    })

    expect(provider.close).toHaveBeenCalledOnce()
    expect(vitest.close).toHaveBeenCalledOnce()
    expect(closeOrder).toEqual(['provider', 'vitest'])
  })

  it('includes the core workspace project when closing providers', async () => {
    const provider = {
      close: vi.fn(async () => {}),
    }
    const vitest = createVitest({
      projects: [],
      coreWorkspaceProject: {
        browser: { provider },
      },
    })

    await cleanupVitestBrowserRun(vitest as any, {
      label: 'Browser story collection',
      timeoutMs: 100,
    })

    expect(provider.close).toHaveBeenCalledOnce()
  })

  it('resolves best-effort (without throwing) when cleanup does not finish before the timeout', async () => {
    vi.useFakeTimers()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const provider = {
      close: vi.fn(async () => {}),
    }
    const vitest = createVitest({
      close: vi.fn(() => new Promise<void>(() => {})),
      projects: [{ browser: { provider } }],
    })

    const cleanupPromise = cleanupVitestBrowserRun(vitest as any, {
      label: 'Histoire tests',
      timeoutMs: 1_000,
    })

    await vi.advanceTimersByTimeAsync(1_000)

    // A slow teardown must not turn an already-successful run into a failure.
    await expect(cleanupPromise).resolves.toBeUndefined()
    expect(provider.close).toHaveBeenCalledOnce()
    // The timeout is surfaced as a warning, not an error.
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Histoire tests cleanup timed out after 1000ms.'),
    )
  })

  it('force kills the browser process when cleanup times out', async () => {
    vi.useFakeTimers()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true)
    const browser = createPlaywrightBrowser(4242)
    const provider = {
      browser,
      // The real Playwright provider nulls `provider.browser` before awaiting
      // the (here: never resolving) page/context/browser close.
      close: vi.fn(() => {
        provider.browser = null
        return new Promise<void>(() => {})
      }) as any,
    }
    const vitest = createVitest({ projects: [{ browser: { provider } }] })

    const cleanupPromise = cleanupVitestBrowserRun(vitest as any, {
      label: 'Histoire tests',
      timeoutMs: 1_000,
    })

    await vi.advanceTimersByTimeAsync(1_000)
    await expect(cleanupPromise).resolves.toBeUndefined()

    // The whole process group is killed: Playwright launches the browser
    // detached, so its renderer children are reaped with it.
    expect(killSpy).toHaveBeenCalledWith(-4242, 'SIGKILL')
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Force killed 1 browser process'))
  })

  it('does not kill the browser when cleanup finishes in time', async () => {
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true)
    const provider = {
      browser: createPlaywrightBrowser(1234),
      close: vi.fn(async () => {}),
    }
    const vitest = createVitest({ projects: [{ browser: { provider } }] })

    await cleanupVitestBrowserRun(vitest as any, {
      label: 'Histoire tests',
      timeoutMs: 1_000,
    })

    expect(killSpy).not.toHaveBeenCalled()
  })

  it('kills a given browser only once across repeated timed-out cleanups', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true)
    const browser = createPlaywrightBrowser(777)
    const provider = {
      browser,
      close: vi.fn(() => new Promise<void>(() => {})),
    }
    const vitest = createVitest({ projects: [{ browser: { provider } }] })

    for (let i = 0; i < 2; i++) {
      const cleanupPromise = cleanupVitestBrowserRun(vitest as any, {
        label: 'Histoire tests',
        timeoutMs: 1_000,
      })
      await vi.advanceTimersByTimeAsync(1_000)
      await cleanupPromise
    }

    expect(killSpy).toHaveBeenCalledTimes(1)
  })

  it('resolves (without throwing) when the hard kill itself fails', async () => {
    vi.useFakeTimers()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('ESRCH')
    })
    const provider = {
      browser: createPlaywrightBrowser(31),
      close: vi.fn(() => new Promise<void>(() => {})),
    }
    const vitest = createVitest({ projects: [{ browser: { provider } }] })

    const cleanupPromise = cleanupVitestBrowserRun(vitest as any, {
      label: 'Histoire tests',
      timeoutMs: 1_000,
    })
    await vi.advanceTimersByTimeAsync(1_000)

    await expect(cleanupPromise).resolves.toBeUndefined()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('could not be force killed'))
  })

  it('propagates a genuine cleanup error', async () => {
    const provider = {
      close: vi.fn(async () => {}),
    }
    const vitest = createVitest({
      close: vi.fn(async () => {
        throw new Error('vitest.close exploded')
      }),
      projects: [{ browser: { provider } }],
    })

    await expect(cleanupVitestBrowserRun(vitest as any, {
      label: 'Histoire tests',
      timeoutMs: 1_000,
    })).rejects.toThrow('vitest.close exploded')
  })
})
