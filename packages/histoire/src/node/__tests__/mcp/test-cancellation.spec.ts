import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanupRunTestsTempDirs, createRunTestsContext, createRunTestsStoryFile, createVitestInstanceStub, installRunTestsMocks } from '../utils/run-tests-harness.js'

let mocks: ReturnType<typeof installRunTestsMocks>
let run: Awaited<ReturnType<ReturnType<typeof installRunTestsMocks>['load']>>

/** Shared runner harness preserves real targeting/spec generation while replacing browser handles. */
beforeEach(async () => {
  vi.resetModules()
  mocks = installRunTestsMocks()
  run = await mocks.load()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  cleanupRunTestsTempDirs()
})

/** One eligible target for setup/start cancellation cases. */
function context() {
  return createRunTestsContext([createRunTestsStoryFile({ id: 'selected', variantId: 'shared', source: 'onTest(() => {})' })])
}

describe('owned test cancellation', () => {
  it('rejects before collection when already aborted', async () => {
    const abort = new AbortController()
    abort.abort()
    await expect(run(context(), { signal: abort.signal, strictCleanup: true })).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(mocks.collectStoriesBrowserMock).not.toHaveBeenCalled()
    expect(mocks.createVitestMock).not.toHaveBeenCalled()
  })

  it('observes late Vitest creation then closes acquired handle without starting or retrying', async () => {
    const abort = new AbortController()
    let resolve!: (runner: any) => void
    let created!: () => void
    const acquiring = new Promise<void>((done) => {
      created = done
    })
    mocks.setCreateVitest(vi.fn(() => {
      created()
      return new Promise((done) => {
        resolve = done
      })
    }))
    const pending = run(context(), { signal: abort.signal, strictCleanup: true })
    await acquiring
    abort.abort()
    const runner = createVitestInstanceStub()
    resolve(runner)
    await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(runner.start).not.toHaveBeenCalled()
    expect(mocks.cleanupVitestBrowserRunMock).toHaveBeenCalledWith(runner, expect.anything())
    expect(mocks.createVitestMock).toHaveBeenCalledOnce()
  })

  it('cancels active start and awaits cleanup before rejecting, with no browser-crash retry', async () => {
    const abort = new AbortController()
    let started!: () => void
    const starting = new Promise<void>((done) => {
      started = done
    })
    let releaseCleanup!: () => void
    mocks.cleanupVitestBrowserRunMock.mockImplementation(() => new Promise((done) => {
      releaseCleanup = () => done({ status: 'graceful' })
    }))
    mocks.setCreateVitest(vi.fn(async () => createVitestInstanceStub({ start: async () => {
      started()
      await new Promise(() => {})
    } })))
    const pending = run(context(), { signal: abort.signal, strictCleanup: true })
    await starting
    abort.abort()
    await vi.waitFor(() => expect(releaseCleanup).toBeTypeOf('function'))
    let settled = false
    void pending.catch(() => {
      settled = true
    })
    expect(settled).toBe(false)
    releaseCleanup()
    await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(mocks.createVitestMock).toHaveBeenCalledOnce()
  })

  it('clears whole-run safety timer immediately when active start is aborted', async () => {
    vi.useFakeTimers()
    const abort = new AbortController()
    let started!: () => void
    const ready = new Promise<void>((done) => {
      started = done
    })
    mocks.setCreateVitest(vi.fn(async () => createVitestInstanceStub({ start: async () => {
      started()
      await new Promise(() => {})
    } })))
    const pending = run(context(), { signal: abort.signal, strictCleanup: true })
    await ready
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    abort.abort()
    await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps direct CLI runner exit status without global snapshot/restore', async () => {
    const previous = process.exitCode
    try {
      mocks.setCreateVitest(vi.fn(async () => createVitestInstanceStub({ start: async () => {
        process.exitCode = 1
      } })))
      await run(context(), { strictCleanup: true })
      expect(process.exitCode).toBe(1)
    }
    finally { process.exitCode = previous }
  })

  it('makes unknown teardown explicit instead of accepting successful test results', async () => {
    mocks.cleanupVitestBrowserRunMock.mockResolvedValue({ status: 'unconfirmed' })
    await expect(run(context(), { strictCleanup: true })).rejects.toMatchObject({ code: 'CLEANUP_UNCONFIRMED' })
    expect(mocks.cleanupVitestBrowserRunMock).toHaveBeenCalledOnce()
    expect(mocks.createVitestMock).toHaveBeenCalledOnce()
  })
})
