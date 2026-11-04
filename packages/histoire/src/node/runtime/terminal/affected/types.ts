import type { TestTarget } from '@histoire/cli/protocol/tests'

/**
 * Why stories are affected, strongest first. `ignored` and `independent` are
 * the only reasons that select nothing.
 */
export type AffectedReason
  = | 'structural' // add/unlink/non-module edit: resolution may have moved anywhere
    | 'unresolved' // a story without a trusted graph (opaque, never proved, stale) cannot be excluded
    | 'setup' // shared setup graph member: every proved story owns it
    | 'shared' // module of several story graphs
    | 'story' // module of exactly one story graph (usually the story file)
    | 'leaf' // unwatched installed/virtual leaf changed its content or became unverifiable
    | 'independent' // known source module outside every proved graph
    | 'ignored' // generated/installed path the existing watcher rules disregard

/** Strongest first; used to pick the headline reason of a selection. */
export const AFFECTED_REASON_ORDER: readonly AffectedReason[] = ['structural', 'unresolved', 'setup', 'shared', 'story', 'leaf', 'independent', 'ignored']

/** Membership decided for one file event, independent of any test scope. */
export interface AffectedChange {
  /** Chokidar event name. */
  event: string
  /** Absolute changed path. */
  file: string
  /** Classification reason. */
  reason: AffectedReason
  /** Exact story IDs known at classification time (graph owners plus conservative extras); never joined into composite keys. */
  storyIds: readonly string[]
  /** Subset of `storyIds` whose graph provably contains the file; the rest are only not excluded. */
  proven: readonly string[]
  /** Every story is affected, including stories the catalog only learns about later. */
  whole: boolean
  /** Some selected stories are not proven affected, only not excluded. */
  conservative: boolean
  /** Monotonic order of the event within the selector. */
  seq: number
}

/** Whether a change selects anything. */
export function isAffecting(change: Pick<AffectedChange, 'whole' | 'storyIds'>): boolean {
  return change.whole || change.storyIds.length > 0
}

/** Outcome of intersecting changes with a test scope. */
export interface AffectedSelection {
  /**
   * `ok`: ids are exact. `missing`: the scoped story/variant is absent from the
   * catalog (selection stays empty, never broadened). `unavailable`: no
   * completed catalog yet.
   */
  status: 'ok' | 'missing' | 'unavailable'
  /** Affected story IDs inside the scope, in catalog order; feed `runAffected`. */
  storyIds: string[]
  /** Same selection as exact run targets (variant scope keeps its variant). */
  targets: TestTarget[]
  /** Headline reason; `independent` when nothing is affected. */
  reason: AffectedReason
  /** Every contributing reason. */
  reasons: AffectedReason[]
  /** Some selected stories are included only because they could not be excluded. */
  conservative: boolean
  /** Scope story IDs absent from the catalog (explicit missing-target state). */
  missing: string[]
  /** Catalog revision the selection was made against. */
  revision?: string
}
