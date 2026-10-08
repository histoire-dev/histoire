import type { HistoireProjectTestCollectionResult } from '@histoire/protocol'

export interface RunHistoireTestsOptions {
  /** Isolates Vitest process handlers and exit state from library caller. */
  isolate?: boolean
  /** Execution retries; SDK/library adapters explicitly use zero. */
  maxRetries?: number
  /** Library requests reject explicit missing/ambiguous targets instead of empty success. */
  strictTarget?: boolean
  /** Controller-owned abort signal; cancellation retains lane until cleanup completes. */
  signal?: AbortSignal
  /** Reject unconfirmed runner teardown rather than recycling an unsafe execution lane. */
  strictCleanup?: boolean
  rawVitestArgs?: string[]
  storyId?: string
  variantId?: string
  /**
   * Marks the run as targeting a live dev-server context.
   *
   * Skips the initial story/markdown filesystem scan and reuses the context's
   * current collections: re-scanning resets `ctx.storyFiles` (losing
   * already-collected story data) and appends duplicate markdown entries,
   * corrupting the running server's state. For the same reason the browser
   * collection of such a run never writes back into the context.
   */
  skipStoryScan?: boolean
}

/**
 * A generated Vitest spec file, mapped back to the variant it runs.
 */
export interface GeneratedSpecFile {
  path: string
  storyId: string
  variantId: string
}

/** Private collection inputs; no eligibility fields enter public story metadata. */
export interface CollectHistoireTestsOptions extends RunHistoireTestsOptions {
  /** Generation-owned proof transferred only over the owned worker channel. */
  knownEmptyStoryIds?: string[]
  /** Stable operation identity shared by early results and worker completion. */
  collectionRunId?: string
  /** Completed target subsets; terminal result still contains every target. */
  onProgress?: (collection: HistoireProjectTestCollectionResult) => void
}
