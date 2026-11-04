import type { TerminalOperationDefinition } from './core.js'
import { invalidArgument, isTerminalId, rejectUnknownKeys, requireRecord, TERMINAL_BOUNDS } from './core.js'

/** Lifecycle of one terminal test operation; `cancelling` lasts until cleanup is confirmed. */
export type TestOperationState = 'queued' | 'running' | 'cancelling' | 'completed' | 'failed' | 'cancelled'

/** Operation states that never change again. */
export const TEST_FINAL_STATES: readonly TestOperationState[] = ['completed', 'failed', 'cancelled']

/** Exact target a parent may request. */
export type TestTarget
  = | { scope: 'all' }
    | { scope: 'story', storyId: string }
    | { scope: 'variant', storyId: string, variantId: string }

/** Target as reported back; affected batches (child-internal) carry a bounded story list. */
export type TestTargetDto
  = | TestTarget
    | { scope: 'affected', count: number, storyIds: string[] }

/** Most story IDs echoed for an affected batch; `count` keeps the real size. */
export const TEST_AFFECTED_ECHO = 20

/** Progress of a running operation; counters never mix collection with run totals. */
export interface TestProgressDto {
  /** Phase of the story currently executing. */
  phase: 'collect' | 'run'
  /** Specs finished in that phase for the current story (or the whole run). */
  completed: number
  /** Specs in that phase. */
  total: number
  /** Stories finished of an affected batch; absent for single-target runs. */
  stories?: { completed: number, total: number, current?: string }
}

/** Why a result is not (or no longer) readable (`retired` is produced by the parent for a replaced generation). */
export type TestUnavailableReason = 'evicted' | 'unknown' | 'running' | 'retired'

/** Machine-readable operation failure. */
export interface TestFailureDto {
  /** Stable code (SDK error code, `CANCELLED`, `RUNTIME_CHANGED`, ...). */
  code: string
  /** First line of the failure, bounded. */
  message: string
}

/** One story that could not be collected, so its tests are unknown. */
export interface TestUncollectedDto {
  /** Story path relative to the project root. */
  relativePath: string
  /** Bounded reason. */
  error: string
}

/** Aggregate of a completed run; totals are exact even when cases are omitted. */
export interface TestSummaryDto {
  /** No failed assertion, run error or uncollected story. */
  ok: boolean
  /** Total executed cases. */
  total: number
  /** Passed cases. */
  passed: number
  /** Failed cases. */
  failed: number
  /** Skipped cases. */
  skipped: number
  /** Cases retained and pageable (failures first). */
  retainedCases: number
  /** Cases dropped by retention bounds; their counts remain in the totals. */
  omittedCases: number
  /** Run-level errors that no case owns (bounded text). */
  runErrors: string[]
  /** Run-level errors beyond the retained ones. */
  omittedRunErrors: number
  /** Uncollected stories (bounded list). */
  uncollected: TestUncollectedDto[]
  /** Uncollected stories beyond the retained ones. */
  omittedUncollected: number
}

/** Detached snapshot of one operation; carried by replies and `tests.state` events. */
export interface TestOperationDto {
  /** Opaque ID, unique within the generation. */
  id: string
  /** Current lifecycle state. */
  state: TestOperationState
  /** Requested target. */
  target: TestTargetDto
  /** Runtime epoch that admitted the operation. */
  epoch: string
  /** Catalog revision captured at admission. */
  revision: string
  /** Cancellation was requested (state may still be running until cleanup). */
  cancelRequested: boolean
  /** Latest progress, while queued/running/cancelling. */
  progress?: TestProgressDto
  /** Aggregate, only when `completed`. */
  summary?: TestSummaryDto
  /** Failure, only when `failed` (or cancelled by a fence). */
  failure?: TestFailureDto
  /** Admission time, ms since epoch. */
  queuedAt: number
  /** Lane start, ms since epoch. */
  startedAt?: number
  /** Terminal time, ms since epoch. */
  finishedAt?: number
}

/** One pageable case result. */
export interface TestCaseDto {
  /** Test identity within its variant. */
  id: string
  /** Display name. */
  name: string
  /** Suite-qualified name. */
  fullName: string
  /** Assertion state. */
  state: 'passed' | 'failed' | 'skipped'
  /** Story owning the case. */
  storyId?: string
  /** Variant owning the case. */
  variantId?: string
  /** Bounded failure text blocks. */
  errors: string[]
  /** Set when one entry exceeded its byte bound and its errors were dropped. */
  unavailable?: boolean
}

/** Arguments of `tests.run`. */
export interface TestRunArgs {
  /** Exact target. */
  target: TestTarget
  /** Refuse admission when the catalog moved past this revision. */
  expectedRevision?: string
}

/** Arguments of `tests.get` and `tests.cancel`. */
export interface TestOperationArgs {
  /** Exact operation. */
  operationId: string
}

/** Arguments of `tests.results`. */
export interface TestResultsArgs {
  /** Exact operation. */
  operationId: string
  /** Opaque cursor from the previous page; absent for the first. */
  cursor?: string
  /** Cases per page, 1..100 (default 100); also byte-bounded. */
  limit?: number
  /** Only failed cases. */
  failedOnly?: boolean
}

/** Result of `tests.results`. */
export interface TestResultsPage {
  /** Exact operation. */
  operationId: string
  /** Absent when the page is readable; otherwise why not. Never an instruction to rerun. */
  unavailable?: TestUnavailableReason
  /** Cases of this page. */
  cases: TestCaseDto[]
  /** Cursor of the next page, absent at the end. */
  next?: string
  /** Cases matching the filter, retained. */
  total: number
}

/** Operation map merged into `TerminalOperations`. */
export interface TestOperations {
  'tests.run': TerminalOperationDefinition<TestRunArgs, TestOperationDto>
  'tests.get': TerminalOperationDefinition<TestOperationArgs, TestOperationDto>
  'tests.results': TerminalOperationDefinition<TestResultsArgs, TestResultsPage>
  'tests.cancel': TerminalOperationDefinition<TestOperationArgs, TestOperationDto>
}

/** Payload of the `tests.progress` event (throttled). */
export interface TestProgressEvent {
  /** Operation the progress belongs to. */
  operationId: string
  /** Latest progress. */
  progress: TestProgressDto
}

/** Events merged into `TerminalEvents`. */
export interface TestEvents {
  /** Every state transition, with the full operation snapshot. */
  'tests.state': TestOperationDto
  /** Progress while running. */
  'tests.progress': TestProgressEvent
}

/** Largest page of cases by serialized UTF-8 bytes, below the frame bound. */
export const TEST_PAGE_BYTES = 192 * 1024

/** Longest affected story list accepted by the child-internal batch. */
export const TEST_AFFECTED_MAX = 2000

/**
 * Validates untrusted `tests.run` arguments.
 * @param value Detached JSON from the parent.
 */
export function parseTestRunArgs(value: unknown): TestRunArgs {
  const args = requireRecord(value)
  rejectUnknownKeys(args, ['target', 'expectedRevision'])
  const target = requireRecord(args.target)
  if (args.expectedRevision !== undefined && typeof args.expectedRevision !== 'string') invalidArgument('expectedRevision must be a string')
  const expectedRevision = args.expectedRevision as string | undefined
  if (target.scope === 'all') {
    rejectUnknownKeys(target, ['scope'])
    return { target: { scope: 'all' }, expectedRevision }
  }
  if (target.scope === 'story' || target.scope === 'variant') {
    rejectUnknownKeys(target, target.scope === 'story' ? ['scope', 'storyId'] : ['scope', 'storyId', 'variantId'])
    const ids = target.scope === 'story' ? ['storyId'] : ['storyId', 'variantId']
    // Test IDs are story IDs (up to 1 KiB), not the 100-character transport identifiers.
    for (const key of ids) {
      if (typeof target[key] !== 'string' || !(target[key] as string).length || !(target[key] as string).isWellFormed() || (target[key] as string).length > 1024) invalidArgument(`${key} must be a non-empty string`)
    }
    return { target: target as unknown as TestTarget, expectedRevision }
  }
  return invalidArgument('Unknown test scope')
}

/**
 * Validates untrusted `tests.get`/`tests.cancel` arguments.
 * @param value Detached JSON from the parent.
 */
export function parseTestOperationArgs(value: unknown): TestOperationArgs {
  const args = requireRecord(value)
  rejectUnknownKeys(args, ['operationId'])
  if (!isTerminalId(args.operationId)) invalidArgument('operationId must be a valid identifier')
  return { operationId: args.operationId }
}

/**
 * Validates untrusted `tests.results` arguments.
 * @param value Detached JSON from the parent.
 */
export function parseTestResultsArgs(value: unknown): TestResultsArgs {
  const args = requireRecord(value)
  rejectUnknownKeys(args, ['operationId', 'cursor', 'limit', 'failedOnly'])
  if (!isTerminalId(args.operationId)) invalidArgument('operationId must be a valid identifier')
  if (args.cursor !== undefined && (typeof args.cursor !== 'string' || args.cursor.length > TERMINAL_BOUNDS.idLength)) invalidArgument('cursor must be a short string')
  if (args.limit !== undefined && (!Number.isInteger(args.limit) || (args.limit as number) < 1 || (args.limit as number) > TERMINAL_BOUNDS.pageItems)) invalidArgument(`limit must be 1..${TERMINAL_BOUNDS.pageItems}`)
  if (args.failedOnly !== undefined && typeof args.failedOnly !== 'boolean') invalidArgument('failedOnly must be a boolean')
  return { operationId: args.operationId, cursor: args.cursor as string | undefined, limit: args.limit as number | undefined, failedOnly: args.failedOnly as boolean | undefined }
}

/**
 * Shape check for an operation snapshot arriving from the child (events/replies).
 * @param value Candidate payload.
 */
export function isTestOperationDto(value: unknown): value is TestOperationDto {
  if (!value || typeof value !== 'object') return false
  const op = value as Record<string, unknown>
  return isTerminalId(op.id) && ['queued', 'running', 'cancelling', 'completed', 'failed', 'cancelled'].includes(op.state as string)
    && typeof op.target === 'object' && op.target !== null && typeof op.epoch === 'string' && typeof op.revision === 'string'
    && typeof op.cancelRequested === 'boolean' && typeof op.queuedAt === 'number'
}

/**
 * Shape check for a `tests.progress` event payload.
 * @param value Candidate payload.
 */
export function isTestProgressEvent(value: unknown): value is TestProgressEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as { operationId?: unknown, progress?: Record<string, unknown> }
  return isTerminalId(event.operationId) && !!event.progress && (event.progress.phase === 'collect' || event.progress.phase === 'run')
    && Number.isFinite(event.progress.completed) && Number.isFinite(event.progress.total)
}
