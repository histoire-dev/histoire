import type { HistoireProjectTestCollectionResult } from '@histoire/protocol'
import type { HistoireTestRunSummary } from '@histoire/shared'
import type { Context } from '../context.js'
import type { ExecutionService } from '../runtime/execution-service.js'
import type { ExecutionTask } from '../runtime/execution-types.js'
import type { RunHistoireTestsOptions } from './types.js'
import { HistoireSdkError } from '@histoire/protocol'
import { getRuntimeCatalogForContext } from '../runtime/catalog/attachment.js'
import { getEmbedSourceId } from '../virtual/embed/identity.js'
import { createTestContextSnapshot } from './context-snapshot.js'

/** Capture detached metadata before queueing; acquire runner only at lane head. */
export function createHistoireTestTask(ctx: Context, options: Pick<RunHistoireTestsOptions, 'storyId' | 'variantId'>): ExecutionTask<HistoireTestRunSummary> {
  return createTestOperationTask(ctx, options, 'run') as ExecutionTask<HistoireTestRunSummary>
}

/** Definition collection shares captured source identity and server execution lane. */
export function createHistoireTestCollectionTask(ctx: Context, options: Pick<RunHistoireTestsOptions, 'storyId'>): ExecutionTask<HistoireProjectTestCollectionResult> {
  return createTestOperationTask(ctx, options, 'collect') as ExecutionTask<HistoireProjectTestCollectionResult>
}

/** Both operation kinds validate source ownership before acquisition and completion. */
function createTestOperationTask(ctx: Context, options: Pick<RunHistoireTestsOptions, 'storyId' | 'variantId'>, operation: 'run' | 'collect'): ExecutionTask<HistoireTestRunSummary | HistoireProjectTestCollectionResult> {
  const snapshot = createTestContextSnapshot(ctx)
  const catalog = getRuntimeCatalogForContext(ctx)?.catalog
  const source = catalog?.current
  /** Captured source must still own both lane-head admission and completion. */
  function assertSourceOwner() {
    if (catalog && (!source || catalog.current !== source || catalog.updating)) {
      throw new HistoireSdkError('RUNTIME_CHANGED', 'Test source owner changed')
    }
  }
  return {
    validate: assertSourceOwner,
    async run(signal) {
      assertSourceOwner()
      const runner = operation === 'collect' ? (await import('./collect.js')).collectHistoireProjectTests : (await import('./index.js')).runHistoireTests
      const result = await runner(snapshot, { ...options, skipStoryScan: true, signal, strictCleanup: true, isolate: true, maxRetries: 0 })
      assertSourceOwner()
      // UI/SDK consumers admit work under the portable book identity, not the
      // private runtime-controller project ID. Revision remains admission-owned.
      return source && result.execution ? { ...result, execution: { ...result.execution, sourceId: getEmbedSourceId(snapshot.root), epoch: source.epoch, revision: source.revision } } : result
    },
  }
}

/** Common UI/MCP submission adapter; queue retains runner ownership through confirmed teardown. */
export function enqueueHistoireTestRun(execution: ExecutionService, ctx: Context, options: Pick<RunHistoireTestsOptions, 'storyId' | 'variantId'>, isActive = () => true, operation: 'run' | 'collect' = 'run') {
  const task = operation === 'collect' ? createHistoireTestCollectionTask(ctx, options) : createHistoireTestTask(ctx, options)
  return execution.enqueue<HistoireTestRunSummary | HistoireProjectTestCollectionResult>({ ...task, validate() {
    task.validate?.()
    if (!isActive()) throw new Error('Project runtime closed')
  } })
}
