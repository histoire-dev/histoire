import { describe, expect, it, vi } from 'vitest'
import { claimOutput } from '../../api/output-ownership.js'
import { RuntimeCleanupError } from '../../runtime/cleanup.js'
import { createExecutionService } from '../../runtime/execution-service.js'
import { createPreviewHosting } from '../../runtime/hosting/preview.js'
import { getContextRegistry } from '../../runtime/registry.js'
import { createEmbedBuiltOutput } from '../utils/embed/built-output.js'
import { flushMicrotasks } from '../utils/flush.js'
import { deferred } from '../utils/mcp/deferred.js'

/** Reuses the real built-output fixture and listener with source-owned execution. */
async function createPreviewFixture() {
  const output = await createEmbedBuiltOutput()
  const execution = createExecutionService()
  const onClose = vi.fn()
  output.ctx.config = { ...output.ctx.config, outDir: output.outputRoot, plugins: [] }
  const hosting = await createPreviewHosting({ context: output.ctx, execution, port: 0, host: '127.0.0.1', onChange() {}, onClose })
  return { output, execution, hosting, onClose }
}

describe('built preview cleanup quarantine', () => {
  it('quarantines shared lane and retains ownership when preview context disposer fails', async () => {
    const { output, execution, hosting, onClose } = await createPreviewFixture()
    getContextRegistry(output.ctx).pluginContext.onCleanup(() => {
      throw new Error('preview plugin resource release failed')
    })
    const active = deferred<void>()
    const job = execution.enqueue({ run: () => active.promise })
    await flushMicrotasks()
    const replacement = vi.fn(() => 'must not start')
    const queued = execution.enqueue({ run: replacement })
    try {
      const failure = await hosting.handle.close().then(() => undefined, error => error)
      expect(failure).toMatchObject({ code: 'HISTOIRE_RUNTIME_CLEANUP_FAILED' })
      expect(execution.available).toBe(false)
      await expect(queued.result).rejects.toMatchObject({ code: 'CANCELLED' })
      expect(replacement).not.toHaveBeenCalled()
      expect(() => execution.enqueue({ run: replacement })).toThrow('unavailable')
      expect(onClose).not.toHaveBeenCalled()
      await expect(hosting.handle.close()).rejects.toBe(failure)
      await expect(claimOutput(output.outputRoot, 'build')).rejects.toMatchObject({ code: 'RUNTIME_IN_USE' })
      await expect(fetch(hosting.handle.url)).rejects.toThrow()
      active.resolve()
      await job.result
      await expect(hosting.handle.close()).rejects.toBe(failure)
    }
    finally {
      active.resolve()
      await job.result.catch(() => {})
      await hosting.handle.close().catch(() => {})
      await execution.close().catch(() => {})
      await output.fixture.close()
    }
  })

  it('quarantines nested startup cleanup failure without releasing output or replacing original error', async () => {
    const output = await createEmbedBuiltOutput()
    const execution = createExecutionService()
    const onClose = vi.fn()
    const failure = new AggregateError([new RuntimeCleanupError([], 'preview startup cleanup unknown')], 'preview startup failed')
    output.ctx.config = { ...output.ctx.config, outDir: output.outputRoot, plugins: [{ name: 'unsafe-startup', onPreview() {
      throw failure
    } }] }
    try {
      await expect(createPreviewHosting({ context: output.ctx, execution, port: 0, host: '127.0.0.1', onChange() {}, onClose })).rejects.toBe(failure)
      expect(execution.available).toBe(false)
      expect(onClose).not.toHaveBeenCalled()
      await expect(claimOutput(output.outputRoot, 'build')).rejects.toMatchObject({ code: 'RUNTIME_IN_USE' })
    }
    finally {
      await execution.close().catch(() => {})
      await output.fixture.close()
    }
  })

  it.each(['after failure', 'during restart'] as const)('retains failed retirement when close starts %s and runner settles late', async (when) => {
    const { output, execution, hosting, onClose } = await createPreviewFixture()
    const waiting = deferred<void>()
    let finished = false
    const source = hosting.current!
    const job = source.execution.enqueue({ async run() {
      await waiting.promise
      finished = true
    } })
    await flushMicrotasks()
    // Only deadline timers advance; output reads and listener cleanup stay real.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const restarting = hosting.handle.restart()
      const checkedRestart = expect(restarting).rejects.toMatchObject({ code: 'CLEANUP_UNCONFIRMED' })
      const closing = when === 'during restart' ? hosting.handle.close() : undefined
      const closeOutcome = closing?.then(() => undefined, error => error)
      await vi.advanceTimersByTimeAsync(10_001)
      await checkedRestart
      expect(source.isActive()).toBe(false)
      expect(finished).toBe(false)
      if (when === 'after failure') await expect(hosting.handle.restart()).rejects.toMatchObject({ code: 'CLEANUP_UNCONFIRMED' })
      const failure = closeOutcome ? await closeOutcome : await hosting.handle.close().then(() => undefined, error => error)
      expect(failure).toMatchObject({ code: 'CLEANUP_UNCONFIRMED' })
      expect(onClose).not.toHaveBeenCalled()
      await expect(claimOutput(output.outputRoot, 'build')).rejects.toMatchObject({ code: 'RUNTIME_IN_USE' })
      waiting.resolve()
      await expect(job.result).rejects.toMatchObject({ code: 'CANCELLED' })
      await flushMicrotasks()
      expect(finished).toBe(true)
      expect(execution.available).toBe(false)
      await expect(hosting.handle.close()).rejects.toBe(failure)
      await expect(claimOutput(output.outputRoot, 'build')).rejects.toMatchObject({ code: 'RUNTIME_IN_USE' })
    }
    finally {
      waiting.resolve()
      vi.useRealTimers()
      await job.result.catch(() => {})
      await hosting.handle.close().catch(() => {})
      await execution.close().catch(() => {})
      await output.fixture.close()
    }
  })

  it('releases output only after confirmed restart and close cleanup', async () => {
    const { output, execution, hosting, onClose } = await createPreviewFixture()
    const aborted = deferred<void>()
    const cleanup = deferred<void>()
    const source = hosting.current!
    const job = source.execution.enqueue({ run(signal) {
      signal.addEventListener('abort', () => aborted.resolve(), { once: true })
      return aborted.promise
    }, cleanup: () => cleanup.promise })
    try {
      await flushMicrotasks()
      const restarting = hosting.handle.restart()
      expect(source.isActive()).toBe(false)
      cleanup.resolve()
      await restarting
      await expect(job.result).rejects.toMatchObject({ code: 'CANCELLED' })
      expect(hosting.current?.epoch).not.toBe(source.epoch)
      expect(hosting.handle.status).toBe('ready')
      await expect(claimOutput(output.outputRoot, 'build')).rejects.toMatchObject({ code: 'RUNTIME_IN_USE' })
      await hosting.handle.close()
      expect(onClose).toHaveBeenCalledOnce()
      expect(execution.available).toBe(true)
      const release = await claimOutput(output.outputRoot, 'build')
      release()
    }
    finally {
      aborted.resolve()
      cleanup.resolve()
      await hosting.handle.close()
      await execution.close()
      await output.fixture.close()
    }
  })
})
