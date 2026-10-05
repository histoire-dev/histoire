import { describe, expect, it } from 'vitest'
import { awaitSdkExecution } from '../../api/execution.js'
import { createExecutionOwner } from '../../runtime/execution-owner.js'
import { createExecutionService } from '../../runtime/execution-service.js'

describe('sDK shared execution cancellation', () => {
  it('removes queued target without starting it or cancelling unrelated source owner', async () => {
    const execution = createExecutionService()
    const firstOwner = createExecutionOwner(execution)
    const secondOwner = createExecutionOwner(execution)
    let finish!: () => void
    const active = secondOwner.enqueue({ run: () => new Promise<void>((resolve) => {
      finish = resolve
    }) })
    await Promise.resolve()
    let launches = 0
    const signal = new AbortController()
    const queued = awaitSdkExecution(firstOwner.enqueue({ run: async () => {
      launches++
    } }), signal.signal)
    signal.abort()
    await expect(queued).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(launches).toBe(0)
    expect(active.state).toBe('running')
    finish()
    await active.result
    await execution.close()
  })

  it('keeps active cancellation pending and lane occupied until cleanup completes', async () => {
    const execution = createExecutionService()
    let finishRun!: () => void
    let finishCleanup!: () => void
    let cleanupStarted = false
    let nextStarted = false
    let settled = false
    const signal = new AbortController()
    const cancelled = awaitSdkExecution(execution.enqueue({
      run: () => new Promise<void>((resolve) => {
        finishRun = resolve
      }),
      cleanup: () => {
        cleanupStarted = true
        return new Promise<void>((resolve) => {
          finishCleanup = resolve
        })
      },
    }), signal.signal)
    void cancelled.finally(() => {
      settled = true
    }).catch(() => {})
    await Promise.resolve()
    const next = execution.enqueue({ run: async () => {
      nextStarted = true
    } })
    signal.abort()
    finishRun()
    await Promise.resolve()
    await Promise.resolve()
    expect(cleanupStarted).toBe(true)
    expect(settled).toBe(false)
    expect(nextStarted).toBe(false)
    finishCleanup()
    await expect(cancelled).rejects.toMatchObject({ code: 'CANCELLED' })
    await next.result
    expect(nextStarted).toBe(true)
    await execution.close()
  })
})
