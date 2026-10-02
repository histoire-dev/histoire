import type { Story, Variant } from './story.js'

export interface HistoireSerializedTestError {
  name?: string
  message: string
  stack?: string
  diff?: string
  raw?: unknown
}

export type HistoireTestError = string | HistoireSerializedTestError

export interface HistoireTestContext {
  story: Story
  variant: Variant
  canvas: HTMLElement
}

export type HistoireTestRegistration = (context: HistoireTestContext) => void

/** Runtime context passed to test bodies and per-test lifecycle hooks. */
export interface HistoireTestRuntimeContext {
  /** Current Vitest task, or Histoire's compatible preview task. */
  task: any
  /** Shared Vitest-compatible assertion API. */
  expect: any
  /** Registers a callback that runs after the test body and teardown. */
  onTestFinished: (callback: (context: HistoireTestRuntimeContext) => unknown, timeout?: number) => void
  /** Registers a callback that runs when this test has failed. */
  onTestFailed: (callback: (context: HistoireTestRuntimeContext) => unknown, timeout?: number) => void
}

/** Minimal suite metadata supplied as the final argument to Vitest hooks. */
export interface HistoireTestSuiteContext {
  /** Vitest task kind. */
  type: 'suite'
  /** Local suite name. */
  name: string
  /** Ancestor suite names joined with Vitest's separator. */
  fullName: string
}

/** Test body collected from a story's Vitest facade. */
export type HistoireTestHandler = (context: HistoireTestRuntimeContext) => Promise<void> | void

/** Lifecycle callback registered through Vitest's suite API. */
export type HistoireTestHook = (
  context?: HistoireTestRuntimeContext | Record<string, never>,
  suite?: HistoireTestSuiteContext,
) => Promise<void | HistoireTestCleanup> | void | HistoireTestCleanup

/** Resource disposer returned by a beforeAll or beforeEach hook. */
export type HistoireTestCleanup = () => Promise<void> | void

/** Lifecycle wrapper introduced by Vitest 4.1. */
export type HistoireTestAroundHook = (
  run: () => Promise<void>,
  context?: HistoireTestRuntimeContext | Record<string, never>,
  suite?: HistoireTestSuiteContext,
) => Promise<void> | void

/** Lifecycle hook plus Vitest's optional per-hook timeout. */
export interface HistoireTestHookEntry {
  /** Callback registered by story code. */
  handler: HistoireTestHook
  /** Per-hook timeout in milliseconds. */
  timeout?: number
}

/** Lifecycle wrapper plus Vitest's optional per-hook timeout. */
export interface HistoireTestAroundHookEntry {
  /** Wrapper registered by story code. */
  handler: HistoireTestAroundHook
  /** Per-phase timeout in milliseconds. */
  timeout?: number
}

/** Lifecycle hook kind supported by Histoire's embedded Vitest facade. */
export type HistoireTestHookKind = 'beforeAll' | 'beforeEach' | 'afterEach' | 'afterAll'

/** Mutable hook lists belonging to one collected suite scope. */
export interface HistoireTestHookScope {
  /** Metadata supplied to hooks registered in this suite. */
  suite: HistoireTestSuiteContext
  /** Wrappers surrounding this suite's complete lifecycle. */
  aroundAll: HistoireTestAroundHookEntry[]
  /** Wrappers surrounding each runnable test in this scope. */
  aroundEach: HistoireTestAroundHookEntry[]
  /** Callbacks run once before the first runnable test in this scope. */
  beforeAll: HistoireTestHookEntry[]
  /** Callbacks run before every runnable test in this scope. */
  beforeEach: HistoireTestHookEntry[]
  /** Callbacks run after every runnable test in this scope. */
  afterEach: HistoireTestHookEntry[]
  /** Callbacks run once after the last runnable test in this scope. */
  afterAll: HistoireTestHookEntry[]
}

/** Execution mode for a collected Histoire test definition. */
export type HistoireTestMode = 'run' | 'skip' | 'only' | 'todo'

export interface HistoireSerializedTestDefinition {
  id: string
  name: string
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

export interface HistoireCollectTestsPayload extends HistoireTestRequestAuthority {
  requestId?: string
  variantKey?: string | null
}

export interface HistoireRunTestsPayload extends HistoireTestRequestAuthority {
  runId?: string
  variantKey?: string | null
}

export interface HistoireTestDefinitionsPayload extends HistoireCollectTestsPayload {
  definitions: HistoireSerializedTestDefinition[]
  /**
   * Present when the preview-side collection crashed — lets the host UI
   * distinguish "no tests registered" from a broken collection.
   */
  error?: HistoireTestError | null
}

/** Result of a preview test collection request, resolved by the host store. */
export interface HistoireTestCollectionResult {
  definitions: HistoireSerializedTestDefinition[]
  /** Set when the preview-side collection crashed instead of returning definitions. */
  error?: HistoireTestError | null
}

export interface HistoireTestResultPayload extends HistoireRunTestsPayload {
  summary: HistoireTestRunSummary
}

export interface HistoireTestCaseResultInput {
  id?: string
  name: string
  fullName?: string
  state: 'passed' | 'failed' | 'skipped'
  errors: HistoireTestError[]
}

export interface HistoireTestDefinition {
  id: string
  name: string
  fullName: string
  /** Mirrors Vitest modifiers such as `.skip`, `.only`, and `.todo`. */
  mode?: HistoireTestMode
  handler?: HistoireTestHandler
  /** Optional Vitest deadline in milliseconds for this test body. */
  timeout?: number
  /** Suite scopes captured during collection; omitted from serialization. */
  hookScopes?: HistoireTestHookScope[]
}

export interface HistoireTestCaseResult {
  id: string
  name: string
  fullName: string
  state: 'passed' | 'failed' | 'skipped'
  errors: HistoireTestError[]
  storyId?: string
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

export interface HistoireTestRunSummary {
  ok: boolean
  total: number
  passed: number
  failed: number
  skipped: number
  errors: HistoireTestError[]
  tests: HistoireTestCaseResult[]
  /**
   * Stories the run had to skip because they failed to collect. Present only
   * when something went wrong: a skipped story may have defined tests, so the
   * run is reported as failed rather than silently under-reporting.
   */
  uncollectedStories?: HistoireUncollectedStory[]
}

export interface HistoireResolvedTestCase extends HistoireSerializedTestDefinition {
  state: HistoireTestCaseResult['state'] | 'idle'
  errors: HistoireTestError[]
  storyId?: string
  variantId?: string
}
