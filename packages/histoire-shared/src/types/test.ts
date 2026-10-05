import type { HistoireTestMode } from '@histoire/protocol'
import type { Story, Variant } from './story.js'

export type { HistoireCollectTestsPayload, HistoireResolvedTestCase, HistoireRunTestsPayload, HistoireSerializedTestDefinition, HistoireSerializedTestError, HistoireTestCaseResult, HistoireTestCaseResultInput, HistoireTestCollectionResult, HistoireTestDefinitionsPayload, HistoireTestError, HistoireTestMode, HistoireTestRequestAuthority, HistoireTestResultPayload, HistoireTestRunSummary, HistoireUncollectedStory } from '@histoire/protocol'

/** Story-owned test execution contract; never sent through wire. */
export interface HistoireTestContext {
  /** Story owned by runtime. */
  story: Story
  /** Variant owned by runtime. */
  variant: Variant
  /** Rendered story canvas. */
  canvas: HTMLElement
}

/** Story-owned test execution contract; never sent through wire. */
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
  /** Test lifecycle data. */
  context?: HistoireTestRuntimeContext | Record<string, never>,
  /** Test lifecycle data. */
  suite?: HistoireTestSuiteContext,
) => Promise<void | HistoireTestCleanup> | void | HistoireTestCleanup

/** Resource disposer returned by a beforeAll or beforeEach hook. */
export type HistoireTestCleanup = () => Promise<void> | void

/** Lifecycle wrapper introduced by Vitest 4.1. */
export type HistoireTestAroundHook = (
  /** Test lifecycle data. */
  run: () => Promise<void>,
  /** Test lifecycle data. */
  context?: HistoireTestRuntimeContext | Record<string, never>,
  /** Test lifecycle data. */
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

/** Story-owned test execution contract; never sent through wire. */
export interface HistoireTestDefinition {
  /** Stable test identity. */
  id: string
  /** Display name. */
  name: string
  /** Suite-qualified test name. */
  fullName: string
  /** Mirrors Vitest modifiers such as `.skip`, `.only`, and `.todo`. */
  mode?: HistoireTestMode
  /** Runtime-local test callback. */
  handler?: HistoireTestHandler
  /** Optional Vitest deadline in milliseconds for this test body. */
  timeout?: number
  /** Suite scopes captured during collection; omitted from serialization. */
  hookScopes?: HistoireTestHookScope[]
}
