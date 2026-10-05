import type { HistoireProjectTestCollectionResult, HistoireTarget, HistoireTestCollectionResult, HistoireTestRunSummary } from '@histoire/protocol'

/** Cached facts for one exact variant; source identity stays model-owned. */
export interface WorkbenchTestEntry {
  /** Explicit execution target. */
  target: HistoireTarget
  /** Latest collected test definitions. */
  collection: HistoireTestCollectionResult | null
  /** Latest completed assertion results. */
  summary: HistoireTestRunSummary | null
  /** Last elapsed wall time in milliseconds. */
  duration: number | null
  /** Changed/cancelled results require another run. */
  stale: boolean
  /** Collection or transport failure, distinct from failed assertions. */
  error: unknown
  /** True while this target owns current server request. */
  running: boolean
}

/** Catalog-projected variant or collection diagnostic in project tree. */
export interface WorkbenchTestRow extends WorkbenchTestEntry {
  /** Optional current catalog evidence before definitions are discovered. */
  hasTests?: boolean
  /** Injective target or diagnostic identity. */
  key: string
  /** Collected story title or diagnostic source label. */
  storyTitle: string
  /** Variant label; absent for collection diagnostics. */
  variantTitle?: string
  /** Failed assertions or collection issue. */
  failed: boolean
  /** Distinguishes known assertion results from collection diagnostics. */
  notCollected: boolean
  /** Rows without collected story identity cannot be selected. */
  selectable: boolean
}

/** Project counts include only current results, with outdated targets separate. */
export interface WorkbenchTestsSummary {
  /** Successful assertions. */
  passed: number
  /** Failed assertions. */
  failed: number
  /** Skipped/todo assertions or unrun skipped definitions. */
  skipped: number
  /** Targets whose previous run is outdated. */
  stale: number
  /** Collection/transport diagnostics. */
  notCollected: number
  /** Definitions still awaiting explicit execution. */
  idle: number
  /** Elapsed completed target runs in milliseconds. */
  duration: number
}

/** First-party execution adapter uses existing shared server lane. */
export interface WorkbenchTestsOptions {
  /** Discover every project variant without running assertion bodies. */
  collectProject?: (signal: AbortSignal) => Promise<HistoireProjectTestCollectionResult>
  /** Refresh all variants of one executable story after HMR. */
  collectStory?: (storyId: string, signal: AbortSignal) => Promise<HistoireProjectTestCollectionResult>
  /** One project-wide server worker; returned cases retain exact target attribution. */
  runProject?: (signal: AbortSignal) => Promise<HistoireTestRunSummary>
  /** One changed story worker, including all currently collected variants. */
  runStory?: (storyId: string, signal: AbortSignal) => Promise<HistoireTestRunSummary>
  /** Explicit target operation; never changes active selection. */
  run?: (target: HistoireTarget, signal: AbortSignal) => Promise<HistoireTestRunSummary>
  /** Existing user-settings record; blocked storage is supported. */
  storage?: Pick<Storage, 'getItem' | 'setItem'>
  /** Shared standalone local preferences; independent models may use storage only. */
  settings?: {
    /** Reactive watch preference used by Settings screen. */
    state: { watchTests: boolean }
    /** Applies shared settings update with owning store persistence. */
    update: (patch: { watchTests: boolean }) => void
  }
  /** Optional exact HMR story notification owned by adapter. */
  onStoryChanged?: (listener: (storyId: string) => void) => () => void
}
