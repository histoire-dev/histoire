import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { deferred } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { canvasStartupCoordinatorFixture, canvasStartupTask } from './fixtures/canvas-startup-coordinator.js'

describe('canvas startup cancellation cleanup', () => {
  it('prunes removed queued cancellation before a later selection barrier', async () => {
    const coordinator = canvasStartupCoordinatorFixture(2)
    const anchorReady = deferred<void>()
    const selectedReady = deferred<void>()
    const started: string[] = []
    coordinator.setOrder(['anchor', 'removed', 'next'])
    coordinator.request('anchor', canvasStartupTask(started, 'anchor', anchorReady.promise))
    const removed = coordinator.request('removed', canvasStartupTask(started, 'removed'))
    coordinator.request('next', canvasStartupTask(started, 'next'))
    await flushPromises()
    expect(started).toEqual(['anchor'])

    coordinator.setOrder(['anchor', 'next'])
    removed.cancel()
    coordinator.setOrder(['removed', 'next', 'anchor'])
    await flushPromises()
    expect(started).toEqual(['anchor'])

    coordinator.request('removed', canvasStartupTask(started, 'removed', selectedReady.promise))
    await flushPromises()
    expect(started).toEqual(['anchor', 'removed'])
    selectedReady.resolve()
    await flushPromises()
    expect(started).toEqual(['anchor', 'removed', 'next'])
    anchorReady.resolve()
    await flushPromises()
  })
})
