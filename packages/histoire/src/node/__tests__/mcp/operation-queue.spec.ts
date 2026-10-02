import { describe, expect, it } from 'vitest'
import { createExecutionService } from '../../runtime/execution-service.js'
import { ExecutionError } from '../../runtime/execution-types.js'
import { flushMicrotasks } from '../utils/flush.js'
import { deferred } from '../utils/mcp/deferred.js'

describe('shared server execution lane', () => {
  it('bounds a synchronous admission burst before first execution microtask', async () => {
    const execution = createExecutionService()
    const jobs = Array.from({ length: 9 }, () => execution.enqueue({ run: () => 'done' }))
    expect(() => execution.enqueue({ run: () => 'overflow' })).toThrow('queue is full')
    await Promise.all(jobs.map(job => job.result))
    const samePrincipal = Array.from({ length: 5 }, () => execution.enqueue({ principal: 'alice', run: () => 'done' }))
    expect(() => execution.enqueue({ principal: 'alice', run: () => 'overflow' })).toThrow('queue is full')
    await Promise.all(samePrincipal.map(job => job.result))
    await execution.close()
  })
  it('serializes UI and MCP work and holds cancellation until cleanup completes', async () => {
    const execution = createExecutionService()
    const run = deferred<string>()
    const cleanup = deferred<void>()
    const events: string[] = []
    const first = execution.enqueue({ principal: 'mcp', run: async () => {
      events.push('mcp')
      return run.promise
    }, cleanup: () => cleanup.promise })
    const second = execution.enqueue({ run: () => {
      events.push('ui')
      return 'ui-result'
    } })
    await flushMicrotasks()
    first.cancel()
    run.resolve('late-result')
    await flushMicrotasks()
    expect(first.state).toBe('cancelling')
    expect(events).toEqual(['mcp'])
    cleanup.resolve()
    await expect(first.result).rejects.toMatchObject({ code: 'CANCELLED' })
    await expect(second.result).resolves.toBe('ui-result')
    expect(events).toEqual(['mcp', 'ui'])
    await execution.close()
  })

  it('enforces waiting quotas before resources start and removes queued cancellations', async () => {
    const execution = createExecutionService({ queuedTotal: 2, queuedPerPrincipal: 1 })
    const running = deferred<void>()
    const first = execution.enqueue({ run: () => running.promise })
    await flushMicrotasks()
    const pending = execution.enqueue({ principal: 'mcp', run: () => 'unused' })
    expect(() => execution.enqueue({ principal: 'mcp', run: () => 'rejected' })).toThrow('queue is full')
    const ui = execution.enqueue({ run: () => 'ui' })
    expect(() => execution.enqueue({ principal: 'another', run: () => 'rejected' })).toThrow('queue is full')
    pending.cancel()
    await expect(pending.result).rejects.toMatchObject({ code: 'CANCELLED' })
    running.resolve()
    await Promise.all([first.result, ui.result])
    await execution.close()
  })

  it('continues after execution rejection, but blocks after unconfirmed cleanup', async () => {
    const execution = createExecutionService()
    const failed = execution.enqueue({ run: () => {
      throw new Error('runner failed')
    } })
    const succeeded = execution.enqueue({ run: () => 'next' })
    await expect(failed.result).rejects.toThrow('runner failed')
    await expect(succeeded.result).resolves.toBe('next')
    const unsafe = execution.enqueue({ run: () => {
      throw new Error('original execution failure')
    }, cleanup: () => {
      throw new Error('cleanup failed')
    } })
    const abandoned = execution.enqueue({ run: () => 'must not start' })
    await expect(unsafe.result).rejects.toMatchObject({ code: 'CLEANUP_UNCONFIRMED', cause: { message: 'original execution failure' } })
    await expect(abandoned.result).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(execution.available).toBe(false)
    expect(() => execution.enqueue({ run: () => 'retry' })).toThrow('unavailable')
    await expect(execution.close()).rejects.toMatchObject({ code: 'CLEANUP_UNCONFIRMED' })
  })

  it('joins confirmed restart cancellation without closing a reusable lane', async () => {
    const execution = createExecutionService()
    const running = deferred<void>()
    const cleanup = deferred<void>()
    const active = execution.enqueue({ run: () => running.promise, cleanup: () => cleanup.promise })
    await flushMicrotasks()
    let drained = false
    const stopping = execution.cancelAll().then(() => {
      drained = true
    })
    running.resolve()
    await flushMicrotasks()
    expect(drained).toBe(false)
    cleanup.resolve()
    await stopping
    await expect(active.result).rejects.toMatchObject({ code: 'CANCELLED' })
    await expect(execution.enqueue({ run: () => 'new generation' }).result).resolves.toBe('new generation')
    await execution.close()
  })

  it('blocks reuse when runner reports unconfirmed cleanup despite later cleanup resolving', async () => {
    const execution = createExecutionService()
    const unsafe = execution.enqueue({
      run: () => { throw new ExecutionError('CLEANUP_UNCONFIRMED', 'Runner teardown is unconfirmed') },
      cleanup: () => {},
    })
    const pending = execution.enqueue({ run: () => 'must not start' })
    await expect(unsafe.result).rejects.toMatchObject({ code: 'CLEANUP_UNCONFIRMED' })
    await expect(pending.result).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(execution.available).toBe(false)
    expect(() => execution.enqueue({ run: () => 'unsafe retry' })).toThrow('unavailable')
    await expect(execution.close()).rejects.toMatchObject({ code: 'CLEANUP_UNCONFIRMED' })
  })

  it('blocks reuse when abort-unaware execution prevents confirmed restart teardown', async () => {
    const execution = createExecutionService({ cleanupTimeoutMs: 5 })
    const running = deferred<void>()
    const active = execution.enqueue({ run: () => running.promise })
    await flushMicrotasks()
    await expect(execution.cancelAll()).rejects.toMatchObject({ code: 'CLEANUP_UNCONFIRMED' })
    expect(execution.available).toBe(false)
    running.resolve()
    await expect(active.result).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(() => execution.enqueue({ run: () => 'unsafe restart' })).toThrow('unavailable')
    await expect(execution.close()).rejects.toMatchObject({ code: 'CLEANUP_UNCONFIRMED' })
  })
})
