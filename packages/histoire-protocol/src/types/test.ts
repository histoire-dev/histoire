import type { HistoireTarget } from './common.js'

/** One engine result retains initiating request and source/document ownership. */
export interface HistoireTestExecutionIdentity {
  /** Existing bridge request or Node runner identity, never a second execution. */
  runId: string
  /** Explicit engine, including preview collection. */
  mode: 'preview' | 'server'
  /** Exact target; omitted only for Node multi-story runs. */
  target?: HistoireTarget
  /** Connected source when execution belongs to a published book. */
  sourceId?: string
  /** Captured published source generation. */
  epoch?: string
  /** Captured immutable publication. */
  revision?: string
  /** Captured ready preview document; absent for server runs. */
  runtimeId?: string
}

/** Portable serialized test data; callbacks stay runtime-local. */
export interface HistoireSerializedTestError {
  /** Display name. */
  name?: string
  /** Formatted failure message. */
  message: string
  /** Formatted stack when available. */
  stack?: string
  /** Assertion difference when available. */
  diff?: string
  /** Explicitly projected diagnostic value; transport requires JSON-safe data. */
  raw?: unknown
}

/** Portable serialized test data; callbacks stay runtime-local. */
export type HistoireTestError = string | HistoireSerializedTestError

/** Execution mode for a collected Histoire test definition. */
export type HistoireTestMode = 'run' | 'skip' | 'only' | 'todo'

/** Portable serialized test data; callbacks stay runtime-local. */
export interface HistoireSerializedTestDefinition {
  /** Stable test identity. */
  id: string
  /** Display name. */
  name: string
  /** Suite-qualified test name. */
  fullName: string
  /** Mirrors Vitest modifiers such as `.skip`, `.only`, and `.todo`. */
  mode?: HistoireTestMode
  /** Optional Vitest deadline in milliseconds for this test body. */
  timeout?: number
}

/** Optional exact authority used by automated same-origin preview hosts. */
export interface HistoireTestRequestAuthority {
  /** Story selected when request was dispatched. */
  storyId?: string | null
  /** Variant selected when request was dispatched. */
  variantId?: string | null
  /** Preview document lifetime; WindowProxy survives navigation. */
  documentId?: string
  /** Owned host capability echoed only for automation correlation. */
  mcpNonce?: string
  /** Captured project generation echoed only for automation correlation. */
  mcpEpoch?: string
}

/** Portable serialized test data; callbacks stay runtime-local. */
export interface HistoireCollectTestsPayload extends HistoireTestRequestAuthority {
  /** Collection request correlation. */
  requestId?: string
  /** Legacy opaque variant correlation key. */
  variantKey?: string | null
}

/** Portable serialized test data; callbacks stay runtime-local. */
export interface HistoireRunTestsPayload extends HistoireTestRequestAuthority {
  /** Execution request correlation. */
  runId?: string
  /** Legacy opaque variant correlation key. */
  variantKey?: string | null
}

/** Portable serialized test data; callbacks stay runtime-local. */
export interface HistoireTestDefinitionsPayload extends HistoireCollectTestsPayload {
  /** Serialized collected definitions. */
  definitions: HistoireSerializedTestDefinition[]
  /**
   * Present when the preview-side collection crashed — lets the host UI
   * distinguish "no tests registered" from a broken collection.
   */
  error?: HistoireTestError | null
}

/** Result of a preview test collection request, resolved by the host store. */
export interface HistoireTestCollectionResult {
  /** Optional additive attribution for SDK adapters; legacy callers remain compatible. */
  execution?: HistoireTestExecutionIdentity
  /** Serialized collected definitions. */
  definitions: HistoireSerializedTestDefinition[]
  /** Set when the preview-side collection crashed instead of returning definitions. */
  error?: HistoireTestError | null
}

/** Definitions discovered across exact variants without executing assertions. */
export interface HistoireProjectTestCollectionResult {
  /** Captured server operation and source publication. */
  execution: HistoireTestExecutionIdentity
  /** Includes successful empty collections and per-variant failures. */
  variants: {
    /** Exact variant identity within its story. */
    target: HistoireTarget & { variantId: string }
    /** Definitions or portable collection error. */
    collection: HistoireTestCollectionResult
  }[]
}

/** Portable serialized test data; callbacks stay runtime-local. */
export interface HistoireTestResultPayload extends HistoireRunTestsPayload {
  /** Completed execution results. */
  summary: HistoireTestRunSummary
}

/** Portable serialized test data; callbacks stay runtime-local. */
export interface HistoireTestCaseResultInput {
  /** Stable test identity. */
  id?: string
  /** Display name. */
  name: string
  /** Suite-qualified test name. */
  fullName?: string
  /** Completed assertion state. */
  state: 'passed' | 'failed' | 'skipped'
  /** Formatted assertion or lifecycle failures. */
  errors: HistoireTestError[]
}

/** Portable serialized test data; callbacks stay runtime-local. */
export interface HistoireTestCaseResult {
  /** Stable test identity. */
  id: string
  /** Display name. */
  name: string
  /** Suite-qualified test name. */
  fullName: string
  /** Completed assertion state. */
  state: 'passed' | 'failed' | 'skipped'
  /** Formatted assertion or lifecycle failures. */
  errors: HistoireTestError[]
  /** Exact collected story identity. */
  storyId?: string
  /** Exact collected variant identity. */
  variantId?: string
}

/**
 * A story that could not be collected during a test run, so whether it defines
 * tests at all is unknown.
 */
export interface HistoireUncollectedStory {
  /** Story path relative to the project root. */
  relativePath: string
  /** Why the story could not be collected. */
  error: string
}

/** Portable serialized test data; callbacks stay runtime-local. */
export interface HistoireTestRunSummary {
  /** Optional additive attribution, shared by SDK/Node results and bridge progress. */
  execution?: HistoireTestExecutionIdentity
  /** Whether run completed without failed assertions or collection failures. */
  ok: boolean
  /** Total completed tests. */
  total: number
  /** Passed assertions. */
  passed: number
  /** Failed assertions. */
  failed: number
  /** Skipped tests. */
  skipped: number
  /** Formatted assertion or lifecycle failures. */
  errors: HistoireTestError[]
  /** Attributable per-test results. */
  tests: HistoireTestCaseResult[]
  /**
   * Stories the run had to skip because they failed to collect. Present only
   * when something went wrong: a skipped story may have defined tests, so the
   * run is reported as failed rather than silently under-reporting.
   */
  uncollectedStories?: HistoireUncollectedStory[]
}

/** Portable serialized test data; callbacks stay runtime-local. */
export interface HistoireResolvedTestCase extends HistoireSerializedTestDefinition {
  /** Completed assertion state. */
  state: HistoireTestCaseResult['state'] | 'idle'
  /** Formatted assertion or lifecycle failures. */
  errors: HistoireTestError[]
  /** Exact collected story identity. */
  storyId?: string
  /** Exact collected variant identity. */
  variantId?: string
}
