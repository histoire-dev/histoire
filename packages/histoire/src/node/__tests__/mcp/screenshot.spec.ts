import { describe, expect, it, vi } from 'vitest'
import { createScreenshotTask, readPngDimensions } from '../../mcp/browser/screenshot.js'
import { createPreviewSession } from '../../mcp/browser/session.js'
import { MCP_LIMITS } from '../../mcp/protocol/limits.js'
import { createExecutionService } from '../../runtime/execution-service.js'
import { deferred } from '../utils/mcp/deferred.js'
import { createPreviewBrowserFixture, PREVIEW_PNG } from '../utils/mcp/preview-browser.js'

describe('isolated screenshot execution', () => {
  it('starts resources only in lane, captures PNG once, and expires host after confirmed close', async () => {
    const fixture = createPreviewBrowserFixture()
    const task = createScreenshotTask(fixture.session)
    expect(fixture.launch).not.toHaveBeenCalled()
    const execution = createExecutionService()
    const output = await execution.enqueue(task).result
    expect(output.result).toMatchObject({ storyId: 'story', variantId: 'variant', width: 480, height: 320, bytes: PREVIEW_PNG.length })
    expect(output.artifact).toEqual(PREVIEW_PNG)
    expect(fixture.launch).toHaveBeenCalledOnce()
    expect(fixture.screenshot).toHaveBeenCalledOnce()
    expect(fixture.close).toHaveBeenCalledOnce()
    expect(fixture.host.render(new URL(fixture.page.goto.mock.calls[0][0]).pathname)).toBeUndefined()
    await execution.close()
  })

  it('cancellation closes owned browser and holds lane until cleanup resolves', async () => {
    const ready = deferred<void>()
    const closed = deferred<void>()
    const fixture = createPreviewBrowserFixture({ wait: () => ready.promise, close: () => {
      ready.reject(new Error('Browser closed'))
      return closed.promise
    } })
    const execution = createExecutionService()
    const job = execution.enqueue(createScreenshotTask(fixture.session))
    await vi.waitFor(() => expect(fixture.page.waitForFunction).toHaveBeenCalledOnce())
    job.cancel()
    expect(job.state).toBe('cancelling')
    const next = vi.fn(async () => 'next')
    const following = execution.enqueue({ run: next })
    await vi.waitFor(() => expect(fixture.close).toHaveBeenCalledOnce())
    expect(next).not.toHaveBeenCalled()
    closed.resolve()
    await expect(job.result).rejects.toMatchObject({ code: 'CANCELLED' })
    await expect(following.result).resolves.toBe('next')
    await execution.close()
  })

  it('rejects oversized or dimension-mismatched captures and still closes browser', async () => {
    const tooLarge = createPreviewBrowserFixture({ png: new Uint8Array(MCP_LIMITS.artifactBytes + 1) })
    const wrongSize = createPreviewBrowserFixture()
    wrongSize.session.target.width = 320
    for (const [fixture, code] of [[tooLarge, 'RESULT_TOO_LARGE'], [wrongSize, 'INTERNAL_ERROR']] as const) {
      const execution = createExecutionService()
      await expect(execution.enqueue(createScreenshotTask(fixture.session)).result).rejects.toMatchObject({ code })
      expect(fixture.close).toHaveBeenCalledOnce()
      await execution.close()
    }
  })

  it('detects complete PNG dimensions and rejects truncated data', () => {
    expect(readPngDimensions(PREVIEW_PNG)).toEqual({ width: 480, height: 320 })
    expect(() => readPngDimensions(PREVIEW_PNG.subarray(0, 40))).toThrow('invalid PNG')
    expect(() => readPngDimensions(PREVIEW_PNG.subarray(0, PREVIEW_PNG.length - 1))).toThrow('incomplete PNG')
  })

  it('observes late browser acquisition during close and never creates context afterwards', async () => {
    const fixture = createPreviewBrowserFixture()
    const acquired = deferred<any>()
    fixture.launch.mockImplementation(() => acquired.promise)
    const session = createPreviewSession(fixture.session)
    const opening = session.open(new AbortController().signal)
    const checked = expect(opening).rejects.toMatchObject({ code: 'CANCELLED' })
    const closing = session.close()
    acquired.resolve({ newContext: fixture.newContext, close: fixture.close })
    await closing
    await checked
    expect(fixture.close).toHaveBeenCalledOnce()
    expect(fixture.newContext).not.toHaveBeenCalled()
    await expect(session.open(new AbortController().signal)).rejects.toMatchObject({ code: 'CANCELLED' })
  })

  it('close before open forbids later acquisition', async () => {
    const fixture = createPreviewBrowserFixture()
    const session = createPreviewSession(fixture.session)
    await session.close()
    await expect(session.open(new AbortController().signal)).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(fixture.launch).not.toHaveBeenCalled()
  })

  it('uncaught preview error closes browser and fails without raw error disclosure', async () => {
    const ready = deferred<void>()
    const fixture = createPreviewBrowserFixture({ wait: () => ready.promise, close: async () => ready.reject(new Error('/private/project/secret.ts')) })
    const execution = createExecutionService()
    const job = execution.enqueue(createScreenshotTask(fixture.session))
    await vi.waitFor(() => expect(fixture.page.waitForFunction).toHaveBeenCalledOnce())
    fixture.fail()
    await expect(job.result).rejects.toMatchObject({ code: 'PREVIEW_NOT_READY', message: 'Preview page failed' })
    expect(fixture.close).toHaveBeenCalledOnce()
    await execution.close()
  })

  it('whole-preview deadline aborts pending readiness and confirms cleanup', async () => {
    const ready = deferred<void>()
    const fixture = createPreviewBrowserFixture({ wait: () => ready.promise, close: async () => ready.reject(new Error('Browser closed')) })
    const execution = createExecutionService()
    const job = execution.enqueue(createScreenshotTask({ ...fixture.session, timeoutMs: 20 }))
    await expect(job.result).rejects.toMatchObject({ code: 'TIMEOUT' })
    expect(fixture.close).toHaveBeenCalledOnce()
    expect(fixture.screenshot).not.toHaveBeenCalled()
    expect(execution.available).toBe(true)
    await execution.close()
  })

  it('discards capture from replaced document and awaits replacement readiness', async () => {
    const fixture = createPreviewBrowserFixture()
    let documents = 0
    let oldChecks = 0
    fixture.page.evaluate.mockImplementation(async (_callback, expected) => {
      if (!expected) return ++documents === 1 ? 'old' : 'new'
      if (expected === 'old') return ++oldChecks === 1
      return true
    })
    fixture.screenshot.mockResolvedValueOnce(new Uint8Array(1))
    const execution = createExecutionService()
    const output = await execution.enqueue(createScreenshotTask(fixture.session)).result
    expect(output.artifact).toEqual(PREVIEW_PNG)
    expect(fixture.screenshot).toHaveBeenCalledTimes(2)
    expect(fixture.page.waitForFunction).toHaveBeenCalledTimes(2)
    await execution.close()
  })

  it('page error after readiness fails capture as preview failure, not caller cancellation', async () => {
    const fixture = createPreviewBrowserFixture()
    fixture.screenshot.mockImplementation(async () => {
      fixture.fail()
      return PREVIEW_PNG
    })
    const execution = createExecutionService()
    await expect(execution.enqueue(createScreenshotTask(fixture.session)).result).rejects.toMatchObject({ code: 'PREVIEW_NOT_READY', message: 'Preview page failed' })
    expect(fixture.close).toHaveBeenCalledOnce()
    await execution.close()
  })
})
