import type { TestOperationDto, TestTarget } from '@histoire/cli/protocol/tests'
import type { CatalogSnapshot } from '../../catalog/types.js'
import type { AffectedSelection } from '../affected/types.js'
import type { PendingClaim } from './pending.js'
import { TerminalError } from '@histoire/cli/protocol/core'
import { TEST_AFFECTED_MAX } from '@histoire/cli/protocol/tests'

/** What one admission attempt should submit. */
export type AdmissionPlan
  = | { kind: 'none' }
    | { kind: 'scope' }
    | { kind: 'affected', storyIds: string[] }

/**
 * Decides what a claimed pending set runs. The exact scope runs whenever it is
 * owed whole, whenever the scope is a single story/variant, and when the
 * affected stories already are the whole book or exceed the batch cap; otherwise only the affected
 * stories run, in catalog order, with interrupted-batch targets included.
 * Targets the catalog no longer has are dropped, never replaced by others.
 * @param scope Captured scope.
 * @param selection Selection of the claimed changes against the current catalog.
 * @param claim Claimed pending set.
 * @param snapshot Current completed catalog.
 */
export function planAdmission(scope: TestTarget, selection: AffectedSelection, claim: PendingClaim, snapshot: CatalogSnapshot): AdmissionPlan {
  const runnable = snapshot.stories.filter(story => !story.docsOnly)
  const wanted = new Set([...selection.storyIds, ...claim.carried])
  const ids = runnable.filter(story => wanted.has(story.id)).map(story => story.id)
  if (claim.whole) return { kind: 'scope' }
  if (!ids.length) return { kind: 'none' }
  if (scope.scope !== 'all' || ids.length >= runnable.length || ids.length > TEST_AFFECTED_MAX) return { kind: 'scope' }
  return { kind: 'affected', storyIds: ids }
}

/** How the scheduler reacts to a refused admission. */
export type AdmissionRefusal
  = | { kind: 'queue-full', reason: string }
    | { kind: 'catalog', reason: string }
    | { kind: 'pause', reason: string }

/**
 * Maps a refused admission to a reaction. A full queue is retried with a
 * bounded backoff; an unfinished catalog waits for the next collection event;
 * everything else pauses visibly until a source change or explicit action.
 * @param error Failure thrown by the test service.
 */
export function classifyRefusal(error: unknown): AdmissionRefusal {
  const message = String(error instanceof Error ? error.message : error).split('\n')[0]
  if (error instanceof TerminalError) {
    if (error.code === 'busy') return { kind: 'queue-full', reason: 'Execution queue is full, waiting for it to drain' }
    if (error.code === 'unavailable' && /catalog is not ready/i.test(message)) return { kind: 'catalog', reason: 'Waiting for stories to finish collecting' }
  }
  return { kind: 'pause', reason: `Run could not be started: ${message}` }
}

/** What the scheduler does after an owned operation ended. */
export interface SettleDecision {
  /** Targets the operation did not validate go back to the pending set. */
  carry: boolean
  /** Pause until a source change or explicit action instead of continuing. */
  pause?: string
}

/**
 * Judges a finished watch operation. Completed runs owe nothing (assertion
 * failures are results). A run that lost its source or was cancelled by a
 * fence owes its unvalidated targets; any other failure owes them too but
 * pauses, so infrastructure trouble is never retried in a loop.
 * @param final Final operation snapshot.
 */
export function judgeSettled(final: TestOperationDto): SettleDecision {
  if (final.state === 'completed') return { carry: false }
  if (final.state === 'failed' && final.failure?.code !== 'RUNTIME_CHANGED') return { carry: true, pause: `Run failed: ${final.failure?.message ?? 'unknown error'}` }
  return { carry: true }
}
