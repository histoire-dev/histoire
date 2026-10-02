import type { HistoireTestRunSummary } from '@histoire/shared'
import type { Context } from '../context.js'
import type { ExecutionService } from '../runtime/execution-service.js'
import type { ExecutionTask } from '../runtime/execution-types.js'
import type { RunHistoireTestsOptions } from './types.js'
import { createTestContextSnapshot } from './context-snapshot.js'

/** Capture detached metadata before queueing; acquire runner only at lane head. */
export function createHistoireTestTask(ctx: Context, options: Pick<RunHistoireTestsOptions, 'storyId' | 'variantId'>): ExecutionTask<HistoireTestRunSummary> {
  const snapshot = createTestContextSnapshot(ctx, options.storyId)
  return {
    async run(signal) {
      const { runHistoireTests } = await import('./index.js')
      return runHistoireTests(snapshot, { ...options, skipStoryScan: true, signal, strictCleanup: true })
    },
  }
}

/** Common UI/MCP submission adapter; queue retains runner ownership through confirmed teardown. */
export function enqueueHistoireTestRun(execution: ExecutionService, ctx: Context, options: Pick<RunHistoireTestsOptions, 'storyId' | 'variantId'>, isActive = () => true) {
  return execution.enqueue({ ...createHistoireTestTask(ctx, options), validate() {
    if (!isActive()) throw new Error('Project runtime closed')
  } })
}
