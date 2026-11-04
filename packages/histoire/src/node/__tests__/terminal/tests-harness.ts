import type { HistoireTestRunSummary } from '@histoire/shared'
import type { RuntimeCatalog } from '../../runtime/catalog/publication.js'
import type { ExecutionTask } from '../../runtime/execution-types.js'
import type { StoryTaskFactory, TestsServiceOptions } from '../../runtime/terminal/tests/service.js'
import type { deferred } from '../utils/mcp/deferred.js'
import { createHistoireTestSummary } from '@histoire/shared'
import { createExecutionOwner } from '../../runtime/execution-owner.js'
import { createExecutionService } from '../../runtime/execution-service.js'
import { createTestsService } from '../../runtime/terminal/tests/service.js'

/** How one fake story body behaves; the lane, owner and service around it are real. */
export interface StoryBehavior {
  /** Body waits for this gate before finishing (external hold). */
  gate?: ReturnType<typeof deferred>
  /** Cleanup waits for this gate, keeping the lane occupied. */
  cleanupGate?: ReturnType<typeof deferred>
  /** Body throws this instead of returning a summary (runner/infrastructure failure). */
  fail?: Error
  /** Number of failing cases (default 0) among `cases`. */
  failures?: number
  /** Cases the story reports (default 2). */
  cases?: number
}

/** Summary of one fake story with known counts. */
export function storySummary(storyId: string, cases = 2, failures = 0): HistoireTestRunSummary {
  return createHistoireTestSummary(storyId, 'main', Array.from({ length: cases }, (_, index) => ({ name: `case ${index}`, state: index < failures ? 'failed' as const : 'passed' as const, errors: index < failures ? ['expected 1 to be 2'] : [] })))
}

/**
 * Real execution lane + terminal-scoped owner + real service, with only the
 * browser runner replaced by observable story bodies.
 * @param stories Story IDs of the fake catalog.
 * @param lane Lane bounds.
 */
export function createTestsHarness(stories: string[] = ['A', 'B', 'C'], lane: Parameters<typeof createExecutionService>[0] = {}) {
  const shared = createExecutionService({ cleanupTimeoutMs: 5000, ...lane })
  const terminal = createExecutionOwner(shared)
  const other = createExecutionOwner(shared)
  const controller = new AbortController()
  const behaviors = new Map<string, StoryBehavior>()
  const log: string[] = []
  const events: Array<{ event: string, data: any }> = []
  let active = true
  let source = { revision: 'r1' }
  const catalog = { get current() {
    return { revision: source.revision, stories: stories.map(id => ({ id, docsOnly: false, variants: [{ id: 'main', title: 'main' }] })) }
  }, updating: false } as unknown as RuntimeCatalog

  const createStoryTask: StoryTaskFactory = ({ storyId }, onRunProgress): ExecutionTask<HistoireTestRunSummary> => {
    const id = storyId ?? 'ALL'
    const capturedRevision = source.revision
    /** Same contract as the real task: captured source must own lane head and completion. */
    function assertOwner() {
      if (source.revision !== capturedRevision) throw Object.assign(new Error('Test source owner changed'), { code: 'RUNTIME_CHANGED' })
    }
    return {
      validate: assertOwner,
      async run(signal) {
        const behavior = behaviors.get(id) ?? {}
        log.push(`run:${id}`)
        onRunProgress({ phase: 'run', completed: 0, total: 1 })
        await Promise.race([behavior.gate?.promise, new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }))])
        signal.throwIfAborted()
        if (behavior.fail) throw behavior.fail
        assertOwner()
        const summary = storySummary(id, behavior.cases, behavior.failures)
        log.push(`done:${id}`)
        return summary
      },
      async cleanup() {
        await behaviors.get(id)?.cleanupGate?.promise
        log.push(`cleanup:${id}`)
      },
    }
  }

  const options: TestsServiceOptions = {
    handle: { context: {} as never, epoch: 'e1', isActive: () => active },
    catalog,
    execution: terminal,
    emit: (event, data) => events.push({ event, data }),
    signal: controller.signal,
    createStoryTask,
    progressIntervalMs: 0,
  }
  const make = (overrides: Partial<TestsServiceOptions> = {}) => createTestsService({ ...options, ...overrides })
  return {
    shared,
    terminal,
    other,
    log,
    events,
    behaviors,
    controller,
    service: make(),
    make,
    /** Declares a story's behavior before it is run. */
    behave(storyId: string, behavior: StoryBehavior) {
      behaviors.set(storyId, behavior)
      return behavior
    },
    /** Simulates a source edit: captured tasks no longer own the catalog. */
    editSource() {
      source = { revision: 'r2' }
    },
    /** Simulates generation release. */
    deactivate() {
      active = false
    },
    /** States seen for one operation, in order, without duplicates. */
    states(operationId: string) {
      return events.filter(entry => entry.event === 'tests.state' && entry.data.id === operationId).map(entry => entry.data.state as string)
    },
  }
}
