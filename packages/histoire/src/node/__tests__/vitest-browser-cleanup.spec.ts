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

  it('throws when browser cleanup does not finish before the timeout', async () => {
    vi.useFakeTimers()
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
    const expectation = expect(cleanupPromise).rejects.toThrow(
      'Histoire tests cleanup timed out after 1000ms.',
    )

    await vi.advanceTimersByTimeAsync(1_000)

    await expectation
    expect(provider.close).toHaveBeenCalledOnce()
  })
})
