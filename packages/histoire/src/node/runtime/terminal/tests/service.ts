import type { TestEvents, TestOperationDto, TestProgressDto, TestResultsArgs, TestResultsPage, TestTarget, TestTargetDto } from '@histoire/cli/protocol/tests'
import type { HistoireTestRunSummary } from '@histoire/shared'
import type { RuntimeCatalog } from '../../catalog/publication.js'
import type { ExecutionService } from '../../execution-service.js'
import type { ExecutionHandle, ExecutionTask } from '../../execution-types.js'
import type { ProjectRuntimeHandle } from '../../types.js'
import type { AffectedBatch } from './batch.js'
import type { ProjectionLimits } from './projection.js'
import type { StoreLimits } from './store.js'
import { randomUUID } from 'node:crypto'
import { TerminalError, truncateText } from '@histoire/cli/protocol/core'
import { TEST_AFFECTED_ECHO, TEST_AFFECTED_MAX } from '@histoire/cli/protocol/tests'
import { createHistoireTestTask } from '../../../test/execution-service.js'
import { CatalogError } from '../../catalog/types.js'
import { ExecutionError } from '../../execution-types.js'
import { createAffectedBatchTask } from './batch.js'
import { readCasesPage, unavailablePage } from './paging.js'
import { DEFAULT_PROJECTION_LIMITS, projectSummary } from './projection.js'
import { createResultStore } from './store.js'

/** Runner progress as reported by the existing runner. */
type RunProgress = Pick<TestProgressDto, 'phase' | 'completed' | 'total'>

/** Builds one story/variant/all task; the default is the existing `createHistoireTestTask`. */
export type StoryTaskFactory = (target: { storyId?: string, variantId?: string }, onRunProgress: (progress: RunProgress) => void) => ExecutionTask<HistoireTestRunSummary>

/** Inputs of the per-generation test service. */
export interface TestsServiceOptions {
  /** Active runtime generation; supplies the context and the activity fence. */
  handle: Pick<ProjectRuntimeHandle, 'context' | 'epoch' | 'isActive'>
  /** Canonical catalog of the generation. */
  catalog: RuntimeCatalog | undefined
  /** Terminal-scoped execution owner over the shared lane. */
  execution: ExecutionService
  /** Parent event sink; dropped by the adapter once the generation retires. */
  emit: <K extends keyof TestEvents & string>(event: K, data: TestEvents[K]) => void
  /** Aborted when the generation is released: stop publishing. */
  signal: AbortSignal
  /** Replaces the runner task factory (tests only). */
  createStoryTask?: StoryTaskFactory
  /** Replaces projection bounds (tests only). */
  projection?: ProjectionLimits
  /** Replaces retention bounds (tests only). */
  store?: StoreLimits
  /** Minimum gap between `tests.progress` events. */
  progressIntervalMs?: number
}

/** Mutable record of an admitted, unfinished operation. */
interface ActiveOperation {
  dto: TestOperationDto
  handle?: ExecutionHandle<HistoireTestRunSummary>
  batch?: AffectedBatch
  timer?: ReturnType<typeof setTimeout>
  progressDirty: boolean
}

/** What a caller learns on admission. */
export interface AdmittedRun {
  /** Snapshot right after admission (queued). */
  operation: TestOperationDto
  /** Resolves, never rejects, with the final snapshot once the lane released and the result was published or suppressed. */
  settled: Promise<TestOperationDto>
  /** Batch stories without a produced result (carry them into a successor); empty for single targets. */
  pending: () => string[]
}

/** Maps lane admission failures to the contracted private-channel codes, preserving visibility. */
function admissionError(error: unknown) {
  if (error instanceof ExecutionError) return new TerminalError(error.code === 'QUEUE_FULL' ? 'busy' : 'unavailable', error.message)
  if (error instanceof CatalogError) return new TerminalError('invalid', error.message)
  return error
}

/**
 * Terminal-owned test operations for one runtime generation. Every run goes
 * through the terminal-scoped owner of the shared FIFO lane: cancelling it
 * touches only terminal submissions, and the lane stays occupied until the
 * runner confirmed cleanup.
 * @param options Generation-scoped capabilities.
 */
export function createTestsService(options: TestsServiceOptions) {
  const store = createResultStore(options.store)
  const limits = options.projection ?? DEFAULT_PROJECTION_LIMITS
  const interval = options.progressIntervalMs ?? 100
  const active = new Map<string, ActiveOperation>()
  const createStoryTask: StoryTaskFactory = options.createStoryTask ?? ((target, onRunProgress) => createHistoireTestTask(options.handle.context, { ...target, onRunProgress }))
  let dead = false

  options.signal.addEventListener('abort', () => {
    // A released generation publishes nothing: late results and progress are suppressed.
    dead = true
    for (const op of active.values()) clearTimeout(op.timer)
  }, { once: true })

  /** Emits unless the generation retired. */
  function emit<K extends keyof TestEvents & string>(event: K, data: TestEvents[K]) {
    if (!dead) options.emit(event, data)
  }

  /** Detached copy safe to hand out. */
  function snapshot(op: ActiveOperation): TestOperationDto {
    return structuredClone(op.dto)
  }

  /** Records and announces a state change. */
  function setState(op: ActiveOperation, state: TestOperationDto['state']) {
    if (op.dto.state === state) return
    op.dto.state = state
    emit('tests.state', snapshot(op))
  }

  /** Records progress; trailing-throttled so a fast runner cannot flood the channel. */
  function reportProgress(op: ActiveOperation, run: RunProgress) {
    const stories = op.batch && { completed: op.batch.progress.completed.length, total: op.batch.progress.storyIds.length, current: op.batch.progress.current }
    op.dto.progress = { ...run, ...(stories ? { stories } : {}) }
    op.progressDirty = true
    if (op.timer || dead) return
    const flush = () => {
      op.timer = undefined
      if (!op.progressDirty || dead || !active.has(op.dto.id)) return
      op.progressDirty = false
      emit('tests.progress', { operationId: op.dto.id, progress: structuredClone(op.dto.progress!) })
    }
    flush()
    op.timer = setTimeout(flush, interval)
    op.timer.unref()
  }

  /** Publishes the lane outcome of one operation exactly once. */
  function conclude(op: ActiveOperation, outcome: { summary: HistoireTestRunSummary } | { error: unknown }) {
    clearTimeout(op.timer)
    active.delete(op.dto.id)
    op.dto.finishedAt = Date.now()
    delete op.dto.progress
    let cases: ReturnType<typeof projectSummary> | undefined
    if ('summary' in outcome) {
      try {
        cases = projectSummary(outcome.summary, limits)
      }
      catch (error) {
        // An unreadable summary must still end the operation, never leave it running.
        outcome = { error: { code: 'FAILED', message: `Test summary could not be read: ${error instanceof Error ? error.message : String(error)}` } }
      }
    }
    if (cases) {
      op.dto.summary = cases.summary
      op.dto.state = 'completed'
    }
    else if ('error' in outcome) {
      const error = outcome.error as { code?: unknown, message?: unknown }
      const code = typeof error?.code === 'string' ? error.code : 'FAILED'
      op.dto.state = code === 'CANCELLED' ? 'cancelled' : 'failed'
      if (op.dto.state === 'failed') op.dto.failure = { code, message: truncateText(String(error?.message ?? error).split('\n')[0], 512).text }
    }
    if (dead) return snapshot(op)
    const final = snapshot(op)
    store.put(final, cases?.cases ?? [], cases?.bytes ?? 0)
    emit('tests.state', final)
    return final
  }

  /** Admits one task on the owned lane and wires its lifecycle to an operation. */
  function submit(target: TestTargetDto, source: { epoch: string, revision: string }, task: ExecutionTask<HistoireTestRunSummary>, batch?: AffectedBatch): AdmittedRun {
    const op: ActiveOperation = { progressDirty: false, batch, dto: { id: randomUUID(), state: 'queued', target, epoch: source.epoch, revision: source.revision, cancelRequested: false, queuedAt: Date.now() } }
    try {
      op.handle = options.execution.enqueue({
        ...task,
        validate() {
          // Lane head: the generation and the captured source must both still own this run.
          if (dead || !options.handle.isActive()) throw new Error('Project runtime closed')
          task.validate?.()
        },
        onState(state) {
          if (state === 'running' && op.dto.state === 'queued') {
            op.dto.startedAt = Date.now()
            setState(op, 'running')
          }
          else if (state === 'cancelling') {
            setState(op, 'cancelling')
          }
        },
      })
    }
    catch (error) {
      // Queue-full/unavailable create no operation and no hidden duplicate.
      throw admissionError(error)
    }
    active.set(op.dto.id, op)
    const settled = op.handle.result.then(summary => conclude(op, { summary }), error => conclude(op, { error }))
    emit('tests.state', snapshot(op))
    return { operation: snapshot(op), settled, pending: () => op.batch?.progress.pending() ?? [] }
  }

  /** Current completed source or the contracted "not ready" refusal. */
  function readySource(expectedRevision?: string) {
    const snapshot = options.catalog?.current
    if (dead || !options.handle.isActive() || !options.catalog || !snapshot || options.catalog.updating) throw new TerminalError('unavailable', 'Catalog is not ready')
    if (expectedRevision !== undefined && expectedRevision !== snapshot.revision) throw new TerminalError('failed', 'Catalog revision changed')
    return { snapshot, epoch: options.handle.epoch, revision: snapshot.revision }
  }

  /** Resolves a story target against the catalog; docs-only stories have nothing to run. */
  function requireStory(snapshot: NonNullable<RuntimeCatalog['current']>, storyId: string, variantId?: string) {
    try {
      const matches = snapshot.stories.filter(story => story.id === storyId)
      if (matches.length > 1) throw new CatalogError('STORY_AMBIGUOUS', 'Story ID is ambiguous', false, { storyId })
      if (!matches.length) throw new CatalogError('STORY_NOT_FOUND', 'Story not found', false, { storyId })
      const [story] = matches
      if (story.docsOnly || !story.variants.length) throw new CatalogError('VARIANT_NOT_FOUND', 'Story has no executable variants', false, { storyId })
      if (variantId !== undefined && story.variants.filter(variant => variant.id === variantId).length !== 1) throw new CatalogError('VARIANT_NOT_FOUND', 'Variant not found', false, { storyId, variantId })
    }
    catch (error) { throw admissionError(error) }
  }

  /** Snapshot of an active or retained operation; evicted or unknown IDs are refused explicitly. */
  function read(operationId: string): TestOperationDto {
    const op = active.get(operationId)
    const found = op ? snapshot(op) : store.operation(operationId)
    if (!found) throw new TerminalError('invalid', `Operation is ${store.missing(operationId)}`)
    return structuredClone(found)
  }

  return {
    /**
     * Admits a test run for an exact target and returns promptly after admission.
     * @param target All, one story or one variant.
     * @param expectedRevision Refuses when the catalog moved on.
     */
    run(target: TestTarget, expectedRevision?: string): AdmittedRun {
      const source = readySource(expectedRevision)
      if (target.scope !== 'all') requireStory(source.snapshot, target.storyId, target.scope === 'variant' ? target.variantId : undefined)
      let op: ActiveOperation | undefined
      const task = createStoryTask(target.scope === 'all' ? {} : { storyId: target.storyId, variantId: target.scope === 'variant' ? target.variantId : undefined }, progress => op && reportProgress(op, progress))
      const admitted = submit(target, source, task)
      op = active.get(admitted.operation.id)
      return admitted
    },
    /**
     * Admits an affected-subset batch: per-story tasks are captured now and run
     * sequentially inside ONE lane submission (never enqueued individually).
     * @param storyIds Exact story IDs; duplicates collapse, unknown IDs reject the whole batch.
     * @param expectedRevision Refuses when the catalog moved on.
     */
    runAffected(storyIds: readonly string[], expectedRevision?: string): AdmittedRun {
      const ids = [...new Set(storyIds)]
      if (!ids.length || ids.length > TEST_AFFECTED_MAX) throw new TerminalError('invalid', 'Affected batch needs 1..2000 stories')
      const source = readySource(expectedRevision)
      for (const id of ids) requireStory(source.snapshot, id)
      let op: ActiveOperation | undefined
      const items = ids.map(storyId => ({ storyId, task: createStoryTask({ storyId }, progress => op && reportProgress(op, progress)) }))
      const batch = createAffectedBatchTask(items, { validate: () => {
        if (dead || !options.handle.isActive()) throw new Error('Project runtime closed')
      } })
      const admitted = submit({ scope: 'affected', count: ids.length, storyIds: ids.slice(0, TEST_AFFECTED_ECHO) }, source, batch.task, batch)
      op = active.get(admitted.operation.id)
      return admitted
    },
    /**
     * Snapshot of an active or retained operation.
     * @param operationId Exact operation.
     */
    get: read,
    /** One page of retained cases, or an explicit unavailable reason. */
    results(args: TestResultsArgs): TestResultsPage {
      if (active.has(args.operationId)) return unavailablePage(args.operationId, 'running')
      const missing = store.missing(args.operationId)
      if (missing) return unavailablePage(args.operationId, missing)
      return readCasesPage(args.operationId, store.cases(args.operationId)!, args)
    },
    /**
     * Requests cancellation of exactly this operation. The state becomes
     * `cancelling` and stays so until the lane confirmed cleanup.
     * @param operationId Exact operation.
     */
    cancel(operationId: string): TestOperationDto {
      const op = active.get(operationId)
      if (!op) return read(operationId)
      if (!op.dto.cancelRequested) {
        op.dto.cancelRequested = true
        setState(op, 'cancelling')
        op.handle?.cancel()
      }
      return snapshot(op)
    },
    /** Operations admitted and not yet concluded. */
    get activeCount() {
      return active.size
    },
  }
}

/** Service type returned by {@link createTestsService}. */
export type TestsService = ReturnType<typeof createTestsService>
