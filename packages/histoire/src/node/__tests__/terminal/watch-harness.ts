import type { WatchStateDto } from '@histoire/cli/protocol/watch'
import type { RuntimeCatalog } from '../../runtime/catalog/publication.js'
import type { AffectedChange } from '../../runtime/terminal/affected/types.js'
import type { WatchSchedulerOptions } from '../../runtime/terminal/watch/scheduler.js'
import type { CollectionEvent } from '../../server/collect.js'
import { selectAffected } from '../../runtime/terminal/affected/select.js'
import { createWatchScheduler } from '../../runtime/terminal/watch/scheduler.js'
import { createTestsHarness } from './tests-harness.js'

/**
 * Real lane, owner, test service and watch scheduler; the browser body, the
 * affected classifier output and collection events are driven by the test. The
 * pure selection (`selectAffected`) is the real one.
 * @param options Story IDs, lane bounds and scheduler timing.
 * @param options.stories Story IDs of the fake catalog.
 * @param options.lane Execution lane bounds.
 * @param options.scheduler Scheduler timing overrides.
 */
export function createWatchHarness(options: { stories?: string[], lane?: Parameters<typeof createTestsHarness>[1], scheduler?: Partial<WatchSchedulerOptions> } = {}) {
  const ids = [...(options.stories ?? ['A', 'B', 'C'])]
  const h = createTestsHarness(ids, options.lane)
  const catalogState = { updating: false, revision: 1 }
  const catalog = { get current() {
    return { revision: `r${catalogState.revision}`, stories: ids.map(id => ({ id, filePath: `${id}.story.vue`, docsOnly: false, variants: [{ id: 'main', title: 'main' }] })) }
  }, get updating() { return catalogState.updating } } as unknown as RuntimeCatalog
  const service = h.make({ catalog })
  const listeners = new Set<(change: AffectedChange) => void>()
  const handlers = new Set<(event: CollectionEvent) => void | Promise<void>>()
  const states: WatchStateDto[] = []
  let seq = 0
  let evidence = 0
  let attached = true
  const scheduler = createWatchScheduler({
    selector: {
      onChange: (listener) => {
        listeners.add(listener)
        return () => void listeners.delete(listener)
      },
      select: (scope, changes) => selectAffected(catalog.current, '/p', scope, changes),
      attach: () => void (attached = true),
      detach: () => void (attached = false),
      refresh: async () => {
        evidence++
        return true
      },
    },
    tests: service,
    catalog,
    onCollection: (handler) => {
      handlers.add(handler)
      return () => void handlers.delete(handler)
    },
    emit: state => states.push(state),
    signal: h.controller.signal,
    settleMs: 5,
    retryMs: { initial: 10, max: 40 },
    ...options.scheduler,
  })
  return {
    ...h,
    service,
    scheduler,
    states,
    ids,
    /** Whether the selector currently observes files. */
    attached: () => attached,
    /** Times dependency evidence was established. */
    evidence: () => evidence,
    /** Latest published phase. */
    phase: () => states.at(-1)?.phase,
    /** Classified edit owned by these stories (shared helper). */
    edit(owners: string[], extra: Partial<AffectedChange> = {}) {
      const change: AffectedChange = { event: 'change', file: '/p/shared.ts', reason: 'shared', storyIds: owners, proven: owners, whole: false, conservative: false, seq: ++seq, ...extra }
      for (const listener of [...listeners]) listener(change)
    },
    /** A collection batch announces itself; the catalog fence closes like the real attachment does. */
    collectionStarted() {
      catalogState.updating = true
      return Promise.all([...handlers].map(handler => handler({ phase: 'started', files: [], outcomes: new Map() })))
    },
    /** The batch published (catalog fence opens) and announces completion. */
    collectionDone(extra: Partial<CollectionEvent> = {}) {
      catalogState.updating = false
      catalogState.revision++
      return Promise.all([...handlers].map(handler => handler({ phase: 'completed', files: [], outcomes: new Map(), ...extra })))
    },
    /** A failed batch (executor exception). */
    collectionFailed(error = new Error('boom')) {
      catalogState.updating = false
      return Promise.all([...handlers].map(handler => handler({ phase: 'failed', files: [], outcomes: new Map(), error })))
    },
    /** Removes stories from the catalog, like deleting their files. */
    removeStory(id: string) {
      ids.splice(ids.indexOf(id), 1)
    },
    /** Story IDs of every `runAffected`/`run` target admitted so far, in order. */
    targets: () => h.events.filter(entry => entry.event === 'tests.state' && entry.data.state === 'queued').map(entry => entry.data.target),
  }
}
