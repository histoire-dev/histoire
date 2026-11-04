import { describe, expect, it } from 'vitest'
import { flushMicrotasks } from '../utils/flush.js'
import { deferred } from '../utils/mcp/deferred.js'
import { storySummary } from './tests-harness.js'
import { createWatchHarness } from './watch-harness.js'

// Boundary: real execution lane, terminal-scoped owner, test service, affected selection and watch
// scheduler; only the browser story bodies, the file-event classifier output and collection
// announcements are driven by the test. Defects: running before collection is usable, losing the
// targets of an interrupted batch, starting a successor before confirmed cleanup, more than one
// successor, a successor after stop, broadening a vanished target, endless retries, runs caused
// by unchanged revalidation, overtaking or cancelling another owner's work.

/** Starts watching All and lets the initial run finish. */
async function startWatching(h: ReturnType<typeof createWatchHarness>) {
  h.scheduler.set({ enabled: true, scope: { scope: 'all' } })
  await expect.poll(() => h.phase()).toBe('idle')
}

describe('watch scheduling', () => {
  it('waits for usable collection, then runs the scope exactly once', async () => {
    const h = createWatchHarness()
    await h.collectionStarted()
    h.scheduler.set({ enabled: true, scope: { scope: 'all' } })
    await new Promise(done => setTimeout(done, 40))
    expect(h.log).toEqual([])
    expect(h.states.at(-1)).toMatchObject({ phase: 'waiting', reason: 'Waiting for stories to finish collecting' })

    // Unchanged publication: the fence opens although no catalog subscription would fire.
    await h.collectionDone()
    await expect.poll(() => h.phase()).toBe('idle')
    expect(h.log.filter(line => line.startsWith('run:'))).toEqual(['run:ALL'])
    expect(h.evidence()).toBe(1)
    expect(h.targets()).toEqual([{ scope: 'all' }])
    // Repeating the same request neither reruns nor re-analyzes.
    h.scheduler.set({ enabled: true, scope: { scope: 'all' } })
    await new Promise(done => setTimeout(done, 40))
    expect(h.log.filter(line => line.startsWith('run:'))).toHaveLength(1)
  })

  it('cancels the stale run, keeps its targets, waits for cleanup and runs one coalesced successor', async () => {
    const h = createWatchHarness()
    await startWatching(h)
    h.log.length = 0
    const hold = h.behave('A', { gate: Object.assign(deferred(), {}), cleanupGate: deferred() })

    h.edit(['A'])
    await expect.poll(() => h.log).toContain('run:A')
    // B is edited while A's body is held; A is not edited again, so only the carried target keeps it owed.
    h.edit(['B'])
    await expect.poll(() => h.states.at(-1)?.reason).toMatch(/stale run/)
    await new Promise(done => setTimeout(done, 60))
    // Cleanup is held: the lane is occupied and no successor was admitted.
    expect(h.log).not.toContain('run:B')
    expect(h.targets()).toHaveLength(2)

    hold.cleanupGate!.resolve()
    hold.gate!.resolve()
    await expect.poll(() => h.log.filter(line => line.startsWith('done:')).length).toBe(2)
    await expect.poll(() => h.phase()).toBe('idle')
    // Exactly one successor ran A and B; C was never involved.
    expect(h.targets()).toEqual([{ scope: 'all' }, { scope: 'affected', count: 1, storyIds: ['A'] }, { scope: 'affected', count: 2, storyIds: ['A', 'B'] }])
    expect(h.log.filter(line => line.startsWith('run:'))).toEqual(['run:A', 'run:A', 'run:B'])
    expect(h.log.indexOf('cleanup:A')).toBeLessThan(h.log.lastIndexOf('run:A'))
  })

  it('re-runs the finished stories of an interrupted batch because no summary was published for them', async () => {
    const h = createWatchHarness({ stories: ['A', 'B', 'C', 'D', 'E'] })
    await startWatching(h)
    h.log.length = 0
    const hold = h.behave('B', { gate: deferred() })

    h.edit(['A', 'B', 'C'])
    await expect.poll(() => h.log).toContain('done:A')
    await expect.poll(() => h.log).toContain('run:B')
    // D is unrelated to the running batch; the batch is stale all the same.
    h.edit(['D'])
    await expect.poll(() => h.states.at(-1)?.reason).toMatch(/stale run/)
    hold.gate!.resolve()
    await expect.poll(() => h.phase()).toBe('idle')
    expect(h.targets().at(-1)).toEqual({ scope: 'affected', count: 4, storyIds: ['A', 'B', 'C', 'D'] })
    expect(h.log.filter(line => line === 'run:A')).toHaveLength(2)
  })

  it('re-runs a batch whose cancellation arrived after its last story finished', async () => {
    const h = createWatchHarness({ stories: ['A', 'B', 'C', 'D'] })
    await startWatching(h)
    h.log.length = 0
    const hold = h.behave('B', { cleanupGate: deferred() })
    h.edit(['A', 'B'])
    await expect.poll(() => h.log).toContain('done:B')
    h.edit(['C'])
    await expect.poll(() => h.states.at(-1)?.reason).toMatch(/stale run/)
    hold.cleanupGate!.resolve()
    await expect.poll(() => h.phase()).toBe('idle')
    expect(h.targets().at(-1)).toMatchObject({ scope: 'affected', storyIds: ['A', 'B', 'C'] })
  })

  it('does not cancel or restart for edits outside the scope', async () => {
    const h = createWatchHarness()
    h.scheduler.set({ enabled: true, scope: { scope: 'story', storyId: 'A' } })
    await expect.poll(() => h.phase()).toBe('idle')
    h.log.length = 0
    h.edit(['B'])
    h.edit([], { reason: 'independent' })
    await new Promise(done => setTimeout(done, 40))
    expect(h.log).toEqual([])
    h.edit(['A'])
    await expect.poll(() => h.log).toContain('done:A')
  })

  it('disabling during held cleanup leaves no successor; a fresh enable runs the scope once', async () => {
    const h = createWatchHarness()
    await startWatching(h)
    h.log.length = 0
    const hold = h.behave('A', { gate: deferred(), cleanupGate: deferred() })
    h.edit(['A'])
    await expect.poll(() => h.log).toContain('run:A')
    h.edit(['B'])
    await expect.poll(() => h.states.at(-1)?.reason).toMatch(/stale run/)
    expect(h.scheduler.set({ enabled: false })).toMatchObject({ enabled: false, phase: 'off' })

    // The late completion must not reschedule A and B.
    hold.cleanupGate!.resolve()
    await expect.poll(() => h.log).toContain('cleanup:A')
    await new Promise(done => setTimeout(done, 80))
    expect(h.targets()).toHaveLength(2)
    expect(h.phase()).toBe('off')

    h.behaviors.delete('A')
    h.scheduler.set({ enabled: true, scope: { scope: 'all' } })
    await expect.poll(() => h.phase()).toBe('idle')
    expect(h.targets().at(-1)).toEqual({ scope: 'all' })
    expect(h.targets()).toHaveLength(3)
  })

  it('a fresh enable while the previous cleanup is still held waits for it and runs once', async () => {
    const h = createWatchHarness()
    await startWatching(h)
    const hold = h.behave('A', { gate: deferred(), cleanupGate: deferred() })
    h.edit(['A'])
    await expect.poll(() => h.log).toContain('run:A')
    h.scheduler.set({ enabled: false })
    h.scheduler.set({ enabled: true, scope: { scope: 'all' } })
    await new Promise(done => setTimeout(done, 40))
    expect(h.targets()).toHaveLength(2)
    h.behaviors.delete('A')
    hold.cleanupGate!.resolve()
    await expect.poll(() => h.targets().length).toBe(3)
    await expect.poll(() => h.phase()).toBe('idle')
    expect(h.targets()).toHaveLength(3)
  })

  it('a retarget cancels owned work, drops pending edits and runs only the new scope', async () => {
    const h = createWatchHarness()
    await startWatching(h)
    const hold = h.behave('A', { gate: deferred() })
    h.edit(['A'])
    await expect.poll(() => h.log).toContain('run:A')
    h.edit(['B'])
    h.behaviors.delete('A')
    h.scheduler.set({ enabled: true, scope: { scope: 'story', storyId: 'C' } })
    hold.gate!.resolve()
    await expect.poll(() => h.phase()).toBe('idle')
    expect(h.targets().at(-1)).toEqual({ scope: 'story', storyId: 'C' })
    expect(h.log.filter(line => line.startsWith('run:'))).not.toContain('run:B')
    expect(h.states.at(-1)?.scope).toEqual({ scope: 'story', storyId: 'C' })
  })

  it('pauses when the selected story vanished and never broadens to the whole book', async () => {
    const h = createWatchHarness()
    h.scheduler.set({ enabled: true, scope: { scope: 'story', storyId: 'B' } })
    await expect.poll(() => h.phase()).toBe('idle')
    h.log.length = 0
    h.removeStory('B')
    await h.collectionStarted()
    h.edit(['B'], { event: 'unlink' })
    await h.collectionDone()
    await expect.poll(() => h.phase()).toBe('paused')
    expect(h.states.at(-1)?.reason).toMatch(/no longer in the catalog/)
    await new Promise(done => setTimeout(done, 40))
    expect(h.log).toEqual([])
    expect(h.targets()).toHaveLength(1)
  })

  it('pauses on collection failure and resumes after a completed collection with the pending edit', async () => {
    const h = createWatchHarness()
    await startWatching(h)
    h.log.length = 0
    await h.collectionStarted()
    h.edit(['A'])
    await h.collectionFailed(new Error('syntax error in A'))
    await expect.poll(() => h.states.at(-1)?.reason).toMatch(/Collection failed: syntax error in A/)
    await new Promise(done => setTimeout(done, 40))
    expect(h.log).toEqual([])
    await h.collectionStarted()
    await h.collectionDone()
    await expect.poll(() => h.log).toContain('done:A')
    expect(h.targets().at(-1)).toMatchObject({ scope: 'affected', storyIds: ['A'] })
  })

  it('background revalidation and collections without edits never trigger a run', async () => {
    const h = createWatchHarness()
    await startWatching(h)
    const count = h.targets().length
    await h.collectionStarted()
    await h.collectionDone({ revalidate: true })
    await h.collectionStarted()
    await h.collectionDone()
    await new Promise(done => setTimeout(done, 60))
    expect(h.targets()).toHaveLength(count)
    expect(h.phase()).toBe('idle')
  })

  it('pauses after an infrastructure failure without retrying; the next edit resumes with the carried target', async () => {
    const h = createWatchHarness()
    await startWatching(h)
    h.behave('A', { fail: new Error('browser crashed\nstack') })
    h.edit(['A', 'B'])
    await expect.poll(() => h.phase()).toBe('paused')
    expect(h.states.at(-1)?.reason).toMatch(/Run failed: browser crashed/)
    await new Promise(done => setTimeout(done, 60))
    // A failed before B started, both are still owed and nothing was retried.
    expect(h.log.filter(line => line === 'run:A')).toHaveLength(1)
    h.behaviors.delete('A')
    h.edit(['C'])
    await expect.poll(() => h.phase()).toBe('idle')
    expect(h.targets().at(-1)).toEqual({ scope: 'all' })
  })

  it('keeps the newest valid batch behind another owner and does not overtake or cancel it', async () => {
    const h = createWatchHarness()
    await startWatching(h)
    h.log.length = 0
    const gate = deferred()
    const other = h.other.enqueue({ run: async () => {
      h.log.push('other:start')
      await gate.promise
      h.log.push('other:end')
      return storySummary('X')
    } })
    await expect.poll(() => h.log).toContain('other:start')
    h.edit(['A'])
    await expect.poll(() => h.targets().at(-1)).toMatchObject({ storyIds: ['A'] })
    // Source edits while the terminal run waits in the queue: the queued run is replaced by the union.
    h.edit(['B'])
    await expect.poll(() => h.targets().at(-1)).toMatchObject({ storyIds: ['A', 'B'] })
    await flushMicrotasks(20)
    expect(other.state).toBe('running')
    expect(h.log).toEqual(['other:start'])

    gate.resolve()
    await other.result
    await expect.poll(() => h.phase()).toBe('idle')
    expect(h.log).toEqual(['other:start', 'other:end', 'run:A', 'done:A', 'cleanup:A', 'run:B', 'done:B', 'cleanup:B'])
  })

  it('waits on a full queue with bounded backoff and keeps edits that arrive meanwhile', async () => {
    const h = createWatchHarness({ lane: { queuedTotal: 1 } })
    await startWatching(h)
    h.log.length = 0
    const gate = deferred()
    const blockers = [0, 1].map(index => h.other.enqueue({ run: async () => {
      h.log.push(`other:${index}`)
      await gate.promise
      return storySummary('X')
    } }))
    await expect.poll(() => h.log).toContain('other:0')
    h.edit(['A'])
    await expect.poll(() => h.states.at(-1)?.reason).toMatch(/queue is full/)
    h.edit(['B'])
    await new Promise(done => setTimeout(done, 80))
    expect(h.phase()).toBe('waiting')
    expect(h.targets()).toHaveLength(1)

    gate.resolve()
    await Promise.all(blockers.map(blocker => blocker.result))
    await expect.poll(() => h.phase()).toBe('idle')
    expect(h.targets().at(-1)).toMatchObject({ scope: 'affected', storyIds: ['A', 'B'] })
  })

  it('stops observing and never reschedules once the generation is released', async () => {
    const h = createWatchHarness()
    await startWatching(h)
    h.controller.abort()
    const count = h.states.length
    h.edit(['A'])
    await h.collectionStarted()
    await h.collectionDone()
    await new Promise(done => setTimeout(done, 40))
    expect(h.targets()).toHaveLength(1)
    expect(h.states).toHaveLength(count)
  })
})
