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

export type HistoireTestHandler = () => Promise<void> | void

/** Execution mode for a collected Histoire test definition. */
export type HistoireTestMode = 'run' | 'skip' | 'only' | 'todo'

export interface HistoireSerializedTestDefinition {
  id: string
  name: string
  fullName: string
  /** Mirrors Vitest modifiers such as `.skip`, `.only`, and `.todo`. */
  mode?: HistoireTestMode
}

export interface HistoireCollectTestsPayload {
  requestId?: string
  variantKey?: string | null
}

export interface HistoireRunTestsPayload {
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
