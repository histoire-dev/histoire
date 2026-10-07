import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { deferred } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { canvasStartupCoordinatorFixture, canvasStartupTask } from './fixtures/canvas-startup-coordinator.js'

describe('canvas startup coordinator', () => {
  it('starts selected frame alone, then fills slots with nearest admitted siblings', async () => {
    const value = canvasStartupCoordinatorFixture(2)
    const selected = deferred<void>()
    const near = deferred<void>()
    const middle = deferred<void>()
    const far = deferred<void>()
    const started: string[] = []
    const active = new Set<string>()
    let peak = 0
    /** Hold each startup and track concurrent activity. */
    const hold = (name: string, gate: typeof selected) => async () => {
      started.push(name)
      active.add(name)
      peak = Math.max(peak, active.size)
      try {
        await gate.promise
      }
      finally {
        active.delete(name)
      }
    }
    value.setOrder(['selected', 'near', 'middle', 'far'])

    // Vue renders candidates before the selected frame in this arrangement.
    value.request('near', hold('near', near))
    value.request('far', hold('far', far))
    value.request('selected', hold('selected', selected))
    value.request('middle', hold('middle', middle))
    await flushPromises()

    expect(started).toEqual(['selected'])
    expect(peak).toBe(1)
    selected.resolve()
    await flushPromises()
    expect(started).toEqual(['selected', 'near', 'middle'])
    expect(peak).toBe(2)
    near.resolve()
    await flushPromises()
    expect(started).toEqual(['selected', 'near', 'middle', 'far'])
    middle.resolve()
    far.resolve()
    await flushPromises()
  })

  it('promotes a new selection while preserving active siblings', async () => {
    const value = canvasStartupCoordinatorFixture(2)
    const initial = deferred<void>()
    const near = deferred<void>()
    const middle = deferred<void>()
    const far = deferred<void>()
    const next = deferred<void>()
    const started: string[] = []
    let nearSignal: AbortSignal | undefined
    let middleSignal: AbortSignal | undefined
    value.setOrder(['initial', 'near', 'middle', 'far', 'next'])

    value.request('near', async (signal) => {
      nearSignal = signal
      started.push('near')
      await near.promise
    })
    value.request('far', canvasStartupTask(started, 'far', far.promise))
    value.request('initial', canvasStartupTask(started, 'initial', initial.promise))
    value.request('middle', async (signal) => {
      middleSignal = signal
      started.push('middle')
      await middle.promise
    })
    value.request('next', canvasStartupTask(started, 'next', next.promise))
    await flushPromises()
    expect(started).toEqual(['initial'])
    initial.resolve()
    await flushPromises()
    expect(started).toEqual(['initial', 'near', 'middle'])

    value.setOrder(['far', 'next', 'near', 'middle', 'initial'])
    expect(nearSignal?.aborted).toBe(false)
    expect(middleSignal?.aborted).toBe(false)

    near.resolve()
    await flushPromises()
    expect(started).toEqual(['initial', 'near', 'middle', 'far'])
    middle.resolve()
    await flushPromises()
    expect(started).toEqual(['initial', 'near', 'middle', 'far'])
    far.resolve()
    await flushPromises()
    expect(started).toEqual(['initial', 'near', 'middle', 'far', 'next'])
    next.resolve()
    await flushPromises()
  })

  it('cancels queued work and holds active capacity until teardown settles', async () => {
    const value = canvasStartupCoordinatorFixture(1)
    const teardown = deferred<void>()
    const started: string[] = []
    let signal: AbortSignal | undefined
    value.setOrder(['active', 'cancelled', 'next'])
    const active = value.request('active', async (currentSignal) => {
      signal = currentSignal
      started.push('active')
      await new Promise<void>((resolve) => {
        currentSignal.addEventListener('abort', () => {
          void teardown.promise.then(resolve)
        }, { once: true })
      })
    })
    await flushPromises()
    const cancelled = value.request('cancelled', canvasStartupTask(started, 'cancelled'))
    value.request('next', canvasStartupTask(started, 'next'))

    cancelled.cancel()
    active.cancel()
    expect(signal?.aborted).toBe(true)
    expect(started).toEqual(['active'])

    teardown.resolve()
    await flushPromises()
    expect(started).toEqual(['active', 'next'])
    await expect(active.completion).resolves.toBeUndefined()
  })

  it('does not invoke work cancelled after slot reservation', async () => {
    const value = canvasStartupCoordinatorFixture(1)
    const started: string[] = []
    value.setOrder(['cancelled', 'next'])
    const cancelled = value.request('cancelled', canvasStartupTask(started, 'cancelled'))
    // Drain reserves capacity; callback invocation is queued for the following microtask.
    await Promise.resolve()
    cancelled.cancel()
    value.request('next', canvasStartupTask(started, 'next'))

    await flushPromises()
    expect(started).toEqual(['next'])
    await expect(cancelled.completion).resolves.toBeUndefined()
  })

  it('opens queue after selected cleanup and restores selected barrier on Retry', async () => {
    const value = canvasStartupCoordinatorFixture(1)
    const cleanup = deferred<void>()
    const retryReady = deferred<void>()
    const near = deferred<void>()
    const far = deferred<void>()
    const next = deferred<void>()
    const started: string[] = []
    value.setOrder(['selected', 'near', 'far', 'next'])

    const failed = value.request('selected', async () => {
      started.push('selected-failed')
      try {
        await cleanup.promise
        throw new Error('startup failed')
      }
      finally {
        started.push('selected-cleaned')
      }
    })
    value.request('near', canvasStartupTask(started, 'near', near.promise))
    value.request('far', canvasStartupTask(started, 'far', far.promise))
    value.request('next', canvasStartupTask(started, 'next', next.promise))

    await flushPromises()
    expect(started).toEqual(['selected-failed'])
    cleanup.resolve()
    await flushPromises()
    expect(started).toEqual(['selected-failed', 'selected-cleaned', 'near'])
    await expect(failed.completion).rejects.toThrow('startup failed')

    value.request('selected', canvasStartupTask(started, 'selected-retry', retryReady.promise))
    value.setOrder(['selected', 'near', 'far', 'next'])
    near.resolve()
    await flushPromises()
    expect(started).toEqual(['selected-failed', 'selected-cleaned', 'near', 'selected-retry'])
    retryReady.resolve()
    await flushPromises()
    expect(started).toEqual(['selected-failed', 'selected-cleaned', 'near', 'selected-retry', 'far'])
    far.resolve()
    await flushPromises()
    expect(started).toEqual(['selected-failed', 'selected-cleaned', 'near', 'selected-retry', 'far', 'next'])
    next.resolve()
    await flushPromises()
  })

  it('handles rapid A/B/A cancellation without starting stale queued work', async () => {
    const value = canvasStartupCoordinatorFixture(1)
    const cleanup = deferred<void>()
    const latestReady = deferred<void>()
    const started: string[] = []
    value.setOrder(['a', 'b'])
    const firstA = value.request('a', async (signal) => {
      started.push('a')
      await new Promise<void>((resolve) => {
        signal.addEventListener('abort', () => {
          void cleanup.promise.then(resolve)
        }, { once: true })
      })
    })
    await flushPromises()
    value.setOrder(['b', 'a'])
    const staleB = value.request('b', canvasStartupTask(started, 'b'))
    value.setOrder(['a', 'b'])
    value.request('a', canvasStartupTask(started, 'a-again', latestReady.promise))
    value.request('next', canvasStartupTask(started, 'next'))
    value.setOrder(['a', 'next', 'b'])

    staleB.cancel()
    firstA.cancel()
    cleanup.resolve()
    await flushPromises()

    expect(started).toEqual(['a', 'a-again'])
    latestReady.resolve()
    await flushPromises()
    expect(started).toEqual(['a', 'a-again', 'next'])
  })

  it('does not let late success clear replacement readiness barrier', async () => {
    const value = canvasStartupCoordinatorFixture(2)
    const oldReady = deferred<void>()
    const newReady = deferred<void>()
    const started: string[] = []
    value.setOrder(['a'])
    const oldA = value.request('a', canvasStartupTask(started, 'old-a', oldReady.promise))
    await flushPromises()

    const newA = value.request('a', canvasStartupTask(started, 'new-a', newReady.promise))
    value.request('next', canvasStartupTask(started, 'next'))
    value.setOrder(['a', 'next'])
    oldA.cancel()
    await flushPromises()
    expect(started).toEqual(['old-a'])

    // Simulate uncooperative transport: old startup succeeds after cancellation.
    oldReady.resolve()
    await flushPromises()
    expect(started).toEqual(['old-a', 'new-a'])

    newReady.resolve()
    await flushPromises()
    expect(started).toEqual(['old-a', 'new-a', 'next'])
    newA.cancel()
  })

  it('does not over-admit reentrant work or start queued work during teardown', async () => {
    const value = canvasStartupCoordinatorFixture(1)
    const teardown = deferred<void>()
    const started: string[] = []
    let signal: AbortSignal | undefined
    value.setOrder(['first', 'reentrant'])
    value.request('first', async (currentSignal) => {
      signal = currentSignal
      started.push('first')
      value.request('reentrant', canvasStartupTask(started, 'reentrant'))
      await new Promise<void>((resolve) => {
        currentSignal.addEventListener('abort', () => {
          void teardown.promise.then(resolve)
        }, { once: true })
      })
    })

    await flushPromises()
    expect(started).toEqual(['first'])
    value.dispose()
    expect(signal?.aborted).toBe(true)
    teardown.resolve()
    await flushPromises()
    expect(started).toEqual(['first'])
  })
})
