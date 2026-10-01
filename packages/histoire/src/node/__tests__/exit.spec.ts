import { afterEach, describe, expect, it, vi } from 'vitest'
import { exitAfterFlush } from '../util/exit.js'

const originalExitCode = process.exitCode

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  process.exitCode = originalExitCode
})

/**
 * Creates a stream stub whose flush completion is controlled by the test.
 * @param options Stub options.
 * @param options.manual Defers the write callback until `flush()` is called.
 */
function createStream(options: { manual?: boolean } = {}) {
  let pendingCallback: (() => void) | undefined

  return {
    write: (_chunk: string, callback: () => void) => {
      if (options.manual) {
        pendingCallback = callback
      }
      else {
        callback()
      }
      return true
    },
    flush: () => pendingCallback?.(),
  }
}

describe('exitAfterFlush', () => {
  it('sets the exit code and lets the process end on its own', async () => {
    vi.useFakeTimers()
    const exit = vi.fn()

    await exitAfterFlush({ code: 1, graceMs: 1_000, streams: [createStream()], exit })

    expect(process.exitCode).toBe(1)
    // No immediate hard exit: buffered output would be discarded.
    expect(exit).not.toHaveBeenCalled()
  })

  it('waits for buffered output before forcing an exit', async () => {
    vi.useFakeTimers()
    const exit = vi.fn()
    const warn = vi.fn()
    const stream = createStream({ manual: true })

    const exitPromise = exitAfterFlush({ code: 1, graceMs: 1_000, streams: [stream], exit, warn })

    // Output is still buffered: the forced exit must not be armed yet.
    await vi.advanceTimersByTimeAsync(900)
    expect(exit).not.toHaveBeenCalled()

    stream.flush()
    await exitPromise
    expect(exit).not.toHaveBeenCalled()

    // Lingering handles keep the loop alive past the grace period.
    await vi.advanceTimersByTimeAsync(1_000)
    expect(exit).toHaveBeenCalledWith(1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('forcing exit'))
  })

  it('gives up on a stuck stream instead of hanging the CLI', async () => {
    vi.useFakeTimers()
    const exit = vi.fn()
    // Never calls back — e.g. a pipe whose reader is gone.
    const exitPromise = exitAfterFlush({
      code: 0,
      graceMs: 1_000,
      streams: [createStream({ manual: true })],
      exit,
      warn: vi.fn(),
    })

    await vi.advanceTimersByTimeAsync(1_000)
    await expect(exitPromise).resolves.toBeUndefined()
  })
})
