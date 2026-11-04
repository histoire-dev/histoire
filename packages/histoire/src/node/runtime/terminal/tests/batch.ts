import type { HistoireTestRunSummary } from '@histoire/shared'
import type { ExecutionTask } from '../../execution-types.js'
import { mergeHistoireTestSummaries } from '@histoire/shared'
import { hasUnconfirmedCleanup } from '../../cleanup.js'
import { ExecutionError } from '../../execution-types.js'

/** One captured per-story task, created (and source-fenced) before the batch is enqueued. */
export interface BatchItem {
  /** Exact story this task runs. */
  storyId: string
  /** Task from `createHistoireTestTask`; its validation and cleanup are honored. */
  task: ExecutionTask<HistoireTestRunSummary>
}

/** Live position of a batch; stays readable after the batch settles. */
export interface BatchProgress {
  /** Every story of the batch, in execution order. */
  readonly storyIds: readonly string[]
  /** Stories whose task finished (assertion failures included). */
  readonly completed: readonly string[]
  /** Story being executed now, or the one that was interrupted. */
  readonly current: string | undefined
  /**
   * Stories whose result was not produced: not yet started, interrupted, or
   * following an infrastructure failure. Callers carry these into a successor.
   */
  pending: () => string[]
}

/** A batch ready for one lane submission. */
export interface AffectedBatch {
  /** Single lane task; enqueue exactly once. */
  task: ExecutionTask<HistoireTestRunSummary>
  /** Position tracker, valid before, during and after execution. */
  progress: BatchProgress
}

/**
 * Builds the affected-subset task. Captured per-story tasks run sequentially
 * inside ONE lane submission: they are called directly and never enqueued, so
 * the occupied lane cannot deadlock on itself. Each task is validated before it
 * starts and cleaned up after it ended, on success and failure alike. An
 * infrastructure failure or abort stops the batch; ordinary assertion failures
 * stay summary data and the batch continues.
 * @param items Captured tasks in execution order.
 * @param options Extra lane-head fence (generation still active).
 * @param options.validate Throws when the owner is gone; checked at the head and before each story.
 */
export function createAffectedBatchTask(items: readonly BatchItem[], options: { validate?: () => void } = {}): AffectedBatch {
  const completed: string[] = []
  const cleaned = new Set<BatchItem>()
  let current: string | undefined

  /** Runs a task's cleanup once; a failed cleanup can never be treated as confirmed. */
  async function cleanup(item: BatchItem) {
    if (cleaned.has(item)) return
    cleaned.add(item)
    try {
      await item.task.cleanup?.()
    }
    catch (error) {
      throw hasUnconfirmedCleanup(error) ? error : new ExecutionError('CLEANUP_UNCONFIRMED', 'Execution cleanup could not be confirmed', error)
    }
  }

  const progress: BatchProgress = {
    storyIds: items.map(item => item.storyId),
    completed,
    get current() {
      return current
    },
    pending: () => progress.storyIds.filter(id => !completed.includes(id)),
  }

  return {
    progress,
    task: {
      validate() {
        options.validate?.()
        items[0]?.task.validate?.()
      },
      async run(signal) {
        const summaries: HistoireTestRunSummary[] = []
        for (const item of items) {
          // Cancellation between stories: nothing later starts, and no later stale success exists.
          signal.throwIfAborted()
          options.validate?.()
          item.task.validate?.()
          current = item.storyId
          let failure: unknown
          let failed = false
          try {
            summaries.push(await item.task.run(signal))
          }
          catch (error) {
            failure = error
            failed = true
          }
          try {
            await cleanup(item)
          }
          catch (cleanupError) {
            // Teardown uncertainty outranks the run failure that preceded it.
            throw failed ? new ExecutionError('CLEANUP_UNCONFIRMED', 'Execution cleanup could not be confirmed', failure) : cleanupError
          }
          if (failed) throw failure
          completed.push(item.storyId)
        }
        // Final fence: the source must still own the result when it is published.
        options.validate?.()
        items.at(-1)?.task.validate?.()
        return mergeHistoireTestSummaries(summaries)
      },
      /** Lane-level cleanup covers tasks that never ran or whose own cleanup is still owed. */
      async cleanup() {
        const failures: unknown[] = []
        for (const item of items) {
          try {
            await cleanup(item)
          }
          catch (error) { failures.push(error) }
        }
        if (failures.length) throw failures[0]
      },
    },
  }
}
