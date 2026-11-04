import { describe, expect, it } from 'vitest'
import { settleTimers } from '../utils/flush.js'
import { deferred } from '../utils/mcp/deferred.js'
import { createWatchHarness } from './watch-harness.js'

// Boundary: real lane, owner, test service, affected selection and watch scheduler (see
// watch-scheduler.spec.ts). Defects: undoing a user's cancel by re-admitting the run in a loop,
// dropping the first story added to an empty book, a stale operation still published once watch is off.

/** Starts watching All and lets the initial run finish. */
async function startWatching(h: ReturnType<typeof createWatchHarness>) {
  h.scheduler.set({ enabled: true, scope: { scope: 'all' } })
  await expect.poll(() => h.phase()).toBe('idle')
}

describe('watch recovery', () => {
  it('pauses after a user cancels the watch run, and the next edit resumes with its targets', async () => {
    const h = createWatchHarness()
    await startWatching(h)
    h.behave('A', { gate: deferred() })
    h.edit(['A'])
    await expect.poll(() => h.states.at(-1)?.operationId).toBeDefined()
    h.service.cancel(h.states.at(-1)!.operationId!)
    await expect.poll(() => h.phase()).toBe('paused')
    expect(h.states.at(-1)?.reason).toBe('Run cancelled')
    await settleTimers(60)
    expect(h.targets()).toHaveLength(2)

    h.behaviors.delete('A')
    h.edit(['B'])
    await expect.poll(() => h.phase()).toBe('idle')
    expect(h.targets().at(-1)).toEqual({ scope: 'affected', count: 2, storyIds: ['A', 'B'] })
  })

  it('runs the first story added to an empty book', async () => {
    const h = createWatchHarness({ stories: [] })
    h.scheduler.set({ enabled: true, scope: { scope: 'all' } })
    await expect.poll(() => h.phase()).not.toBe('waiting')
    const before = h.targets().length
    // The edit is classified before collection: the catalog learns about A only afterwards.
    h.edit([], { event: 'add', file: '/p/A.story.vue', reason: 'structural', whole: true, conservative: true })
    h.ids.push('A')
    await h.collectionDone()
    // The catalog had nothing in scope, yet the added story gets the scope run.
    await expect.poll(() => h.targets()).toHaveLength(before + 1)
    expect(h.targets().at(-1)).toEqual({ scope: 'all' })
  })

  it('publishes no operation once watch is off and its cancelled run cleaned up', async () => {
    const h = createWatchHarness()
    await startWatching(h)
    const hold = h.behave('A', { gate: deferred(), cleanupGate: deferred() })
    h.edit(['A'])
    await expect.poll(() => h.log).toContain('run:A')
    const published = h.states.length
    h.scheduler.set({ enabled: false })
    // Stopping goes straight to `off`, without a transient waiting state.
    expect(h.states.slice(published).map(state => state.phase)).toEqual(['off'])
    hold.cleanupGate!.resolve()
    await expect.poll(() => h.log).toContain('cleanup:A')
    await expect.poll(() => h.states.at(-1)?.operationId).toBeUndefined()
    expect(h.phase()).toBe('off')
  })
})
