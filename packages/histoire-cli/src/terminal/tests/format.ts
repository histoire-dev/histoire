import type { TestOperationDto, TestProgressDto, TestSummaryDto, TestTargetDto } from '../protocol/tests.js'
import type { TestEntry } from './state.js'
import { sanitizeText } from '../output/sanitize.js'

/** Short plain description of what an operation ran. */
export function describeTarget(target: TestTargetDto): string {
  if (target.scope === 'all') return 'all stories'
  if (target.scope === 'story') return `story ${sanitizeText(target.storyId)}`
  if (target.scope === 'variant') return `${sanitizeText(target.storyId)} / ${sanitizeText(target.variantId)}`
  return `${target.count} affected ${target.count === 1 ? 'story' : 'stories'}`
}

/** Collection and run counters are different units, so they are always named. */
export function describeProgress(progress: TestProgressDto): string {
  const unit = progress.phase === 'collect' ? 'Collecting' : 'Running'
  const stories = progress.stories ? ` · story ${progress.stories.completed}/${progress.stories.total}` : ''
  return `${unit} ${progress.completed}/${progress.total}${stories}`
}

/** Exact totals of a completed run. */
function describeTotals(summary: TestSummaryDto): string {
  return `${summary.total} ${summary.total === 1 ? 'test' : 'tests'} · ${summary.passed} passed · ${summary.failed} failed · ${summary.skipped} skipped`
}

/**
 * One-line state of an operation: lifecycle, current progress or final totals, failure.
 * @param operation Latest snapshot.
 * @param progress Latest live progress.
 */
export function describeOperation(operation: TestOperationDto, progress?: TestProgressDto): string {
  switch (operation.state) {
    case 'queued': return 'Queued'
    case 'running': return progress ? describeProgress(progress) : 'Starting'
    case 'cancelling': return 'Cancelling, waiting for cleanup'
    case 'cancelled': return 'Cancelled after cleanup'
    case 'failed': return `Failed · ${sanitizeText(operation.failure?.message ?? 'unknown error')}${operation.failure ? ` (${operation.failure.code})` : ''}`
    case 'completed': return `${operation.summary?.ok ? 'Passed' : 'Finished with problems'} · ${operation.summary ? describeTotals(operation.summary) : 'no summary'}`
  }
}

/**
 * Panel segment for the newest operation; undefined when it is historical or finished long ago.
 * @param entry Newest tracked operation.
 * @param historical Whether the entry no longer describes the running server.
 */
export function describeSegment(entry: TestEntry | undefined, historical: boolean): string | undefined {
  if (!entry || historical || entry.lost) return undefined
  const { operation } = entry
  if (operation.state === 'completed' && operation.summary) return `tests ${operation.summary.passed} passed, ${operation.summary.failed} failed${operation.summary.uncollected.length ? `, ${operation.summary.uncollected.length} uncollected` : ''}`
  if (operation.state === 'failed') return 'tests failed to run'
  if (operation.state === 'cancelled') return 'tests cancelled'
  if (operation.state === 'cancelling') return 'tests cancelling'
  return operation.state === 'queued' || !entry.progress ? `tests ${operation.state}` : `tests ${entry.progress.phase === 'collect' ? 'collecting' : 'running'} ${entry.progress.completed}/${entry.progress.total}`
}
