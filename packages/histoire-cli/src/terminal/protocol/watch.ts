import type { TerminalOperationDefinition } from './core.js'
import type { TestTarget } from './tests.js'
import { invalidArgument, rejectUnknownKeys, requireRecord, TERMINAL_BOUNDS, truncateText } from './core.js'
import { parseTestRunArgs } from './tests.js'

/**
 * Scheduler phase of the child watch. `idle` = enabled with nothing pending,
 * `waiting` = pending work blocked by a barrier (collection, cleanup, queue),
 * `paused` = needs a source change, recovery or explicit action to continue.
 */
export type WatchPhase = 'off' | 'idle' | 'waiting' | 'running' | 'paused'

/** Longest reason text carried by a state snapshot. */
export const WATCH_REASON_MAX = 240

/** Watch state; independent of the server lifecycle and of any single test operation. */
export interface WatchStateDto {
  /** Watching was requested for this generation. */
  enabled: boolean
  /** Scheduler phase. */
  phase: WatchPhase
  /** Exact scope captured when watching was enabled. */
  scope?: TestTarget
  /** Why the scheduler waits or is paused; bounded plain text. */
  reason?: string
  /** Distinct stories waiting for the next run. */
  pending: number
  /** Operation being run (or cancelled) by the watch right now. */
  operationId?: string
  /** Runs admitted since watching was enabled. */
  runs: number
}

/** Arguments of `watch.set`. */
export interface WatchSetArgs {
  /** Desired state. */
  enabled: boolean
  /** Exact scope; required when enabling, ignored when disabling. */
  scope?: TestTarget
}

/** Operation map merged into `TerminalOperations`. */
export interface WatchOperations {
  /** Enables, retargets or disables watching; idempotent for an unchanged request. */
  'watch.set': TerminalOperationDefinition<WatchSetArgs, WatchStateDto>
}

/** Events merged into `TerminalEvents`. */
export interface WatchEvents {
  /** Every state change, with the full snapshot. */
  'watch.state': WatchStateDto
}

/**
 * Validates untrusted `watch.set` arguments. The scope is validated exactly like a
 * `tests.run` target, so the watch can never hold a scope a manual run could not name.
 * @param value Detached JSON from the parent.
 */
export function parseWatchSetArgs(value: unknown): WatchSetArgs {
  const args = requireRecord(value)
  rejectUnknownKeys(args, ['enabled', 'scope'])
  if (typeof args.enabled !== 'boolean') invalidArgument('enabled must be a boolean')
  if (!args.enabled) return { enabled: false }
  if (args.scope === undefined) invalidArgument('scope is required when enabling')
  return { enabled: true, scope: parseTestRunArgs({ target: args.scope }).target }
}

/**
 * Bounds free text of a reason so a state snapshot always fits one frame.
 * @param text Reason text.
 */
export function boundReason(text: string): string {
  return truncateText(text.split('\n')[0], Math.min(WATCH_REASON_MAX, TERMINAL_BOUNDS.logTextLength)).text
}

/**
 * Shape check for a state arriving from the child.
 * @param value Candidate payload.
 */
export function isWatchState(value: unknown): value is WatchStateDto {
  if (!value || typeof value !== 'object') return false
  const state = value as Record<string, unknown>
  return typeof state.enabled === 'boolean' && ['off', 'idle', 'waiting', 'running', 'paused'].includes(state.phase as string)
    && Number.isFinite(state.pending) && Number.isFinite(state.runs)
    && (state.reason === undefined || typeof state.reason === 'string')
    && (state.operationId === undefined || typeof state.operationId === 'string')
}
