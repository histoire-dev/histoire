import type { ServerStory, ServerStoryFile } from '@histoire/shared'
import type { Context } from '../context.js'

/**
 * What a single story file reported back from the browser collection run.
 */
export interface BrowserCollectedStoryResult {
  file: string
  storyData: ServerStory[]
  /** Whether the story registered `onTest(...)` callbacks while collecting. */
  hasTests?: boolean
}

export interface CollectStoriesBrowserOptions {
  /** Abort controller-owned collection without publishing obsolete results. */
  signal?: AbortSignal
  /** Require confirmed runner cleanup before returning. */
  strictCleanup?: boolean
  storyFiles?: Context['storyFiles']
  /**
   * Assigns the collected data onto the live `ctx.storyFiles` objects.
   *
   * Set to `false` when collecting against a running dev server: it collects
   * into the same objects on its own schedule, so writing back would let older
   * browser-collected data overwrite newer node-collected data without the app
   * ever being notified.
   * @default true
   */
  applyToContext?: boolean
  /**
   * Returns the per-story collection failures instead of throwing on them.
   *
   * `histoire test` collects every story just to discover which ones register
   * tests, so one unrelated broken story must not abort the whole run — the
   * caller reports it and keeps going. Callers that need a complete collection
   * (the static build) leave this off and get the hard failure.
   * @default false
   */
  tolerateStoryFailures?: boolean
}

/**
 * One story file that could not be collected, with the reason why.
 */
export interface StoryCollectionFailure {
  /** Story path relative to the project root. */
  relativePath: string
  /** Formatted error explaining why the story could not be collected. */
  error: string
}

/**
 * Outcome of a browser story collection run.
 */
export interface BrowserCollectionResult {
  /** The story files that were collected successfully. */
  files: CollectedStoryFile[]
  /**
   * Stories that failed to collect. Always empty unless the caller opted into
   * {@link CollectStoriesBrowserOptions.tolerateStoryFailures}.
   */
  failures: StoryCollectionFailure[]
}

/**
 * A generated browser collection spec, mapped back to the story it collects.
 */
export interface CollectionSpecFile {
  /** Absolute path of the generated spec. */
  path: string
  /** Story path relative to the project root. */
  relativePath: string
}

export interface CollectedStoryFile {
  /**
   * The finalized story file: the live `ctx.storyFiles` entry, or a detached
   * copy when `applyToContext` is `false`.
   */
  storyFile: ServerStoryFile
  /** Whether the story registered `onTest(...)` callbacks while collecting. */
  hasTests: boolean
}
