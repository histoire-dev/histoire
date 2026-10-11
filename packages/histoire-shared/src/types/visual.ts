import type { HistoireJsonValue } from '@histoire/protocol'
/** Named reproducible capture appearance, independent from canvas preferences. */
export interface HistoireVisualProfile {
  /** Stable human-readable profile key. */
  id: string
  /** CSS viewport width. */
  width?: number
  /** CSS viewport height. */
  height?: number
  /** Integer device scale. */
  deviceScaleFactor?: 1 | 2 | 3
  /** Explicit theme avoids machine-dependent appearance. */
  colorScheme?: 'light' | 'dark'
  /** CSS color or transparent. */
  backgroundColor?: string
  /** Text direction. */
  textDirection?: 'ltr' | 'rtl'
  /** Replaces project runtime globals when supplied. */
  globals?: Record<string, string | number | boolean | null>
}

/** Presence enables visual testing; omitted configuration preserves existing behavior. */
export interface HistoireVisualConfig {
  /** Explicit opt-out. */
  enabled?: boolean
  /** Project-relative tracked directory. */
  baselineDir?: string
  /** Local Git reference used by Compare to main. */
  baselineRef?: string
  /** Nonempty named capture profiles. */
  profiles?: HistoireVisualProfile[]
  /** Story-file globs excluded from automatic and saved cases. */
  exclude?: string[]
  /** Pixelmatch color sensitivity between zero and one. */
  threshold?: number
  /** Maximum fraction of differing pixels. */
  maxDiffPixelRatio?: number
  /** Count anti-aliased pixels when true. */
  includeAA?: boolean
}

/** Complete immutable rendering specification retained with each baseline. */
export interface HistoireVisualCaptureSpec extends Required<HistoireVisualProfile> {
  /** Saved Matrix props; absent for canonical variant state. */
  propsOverride?: Record<string, unknown>
}

/** Durable visual case; canonical variants are derived from current catalog. */
export interface HistoireVisualCase {
  /** Opaque, stable identity derived from target and exact props. */
  id: string
  /** Metadata format version. */
  schemaVersion: 1
  /** Canonical or explicitly saved Matrix cell. */
  kind: 'canonical' | 'matrix'
  /** Exact story identity. */
  storyId: string
  /** Exact scoped variant identity. */
  variantId: string
  /** User-readable case name. */
  label: string
  /** Complete saved props snapshot. */
  propsOverride?: Record<string, unknown>
  /** Optional human-readable Matrix axes. */
  axes?: Record<string, HistoireJsonValue>
}

/** Exact filters intersect; unknown or empty selections fail. */
export interface HistoireVisualRunOptions {
  /** Exact story filter. */
  storyId?: string
  /** Exact variant filter, requiring storyId. */
  variantId?: string
  /** Exact case filter. */
  caseId?: string
  /** Exact profile filter. */
  profileId?: string
  /** Reads committed baseline at pinned ref rather than working tree. */
  baselineRef?: string
  /** Capture only comparisons without valid retained evidence; errors and cancellations recapture. */
  incremental?: boolean
  /** Cancels only this run's jobs. */
  signal?: AbortSignal
}

/** One case/profile comparison outcome. */
export interface HistoireVisualResult {
  /** Stable within a run, opaque comparison key. */
  id: string
  /** Exact visual case. */
  case: HistoireVisualCase
  /** Resolved profile and props. */
  spec: HistoireVisualCaptureSpec
  /** Terminal outcome. */
  status: 'passed' | 'changed' | 'missing' | 'incompatible' | 'error' | 'cancelled'
  /** Number of differing pixels. */
  diffPixels?: number
  /** Fraction of differing pixels. */
  diffPixelRatio?: number
  /** Current device-pixel dimensions. */
  currentDimensions?: { width: number, height: number }
  /** Baseline device-pixel dimensions. */
  baselineDimensions?: { width: number, height: number }
  /** Retained current PNG hash. */
  currentHash?: string
  /** Actual Chromium version. */
  browserVersion?: string
  /** Artifact names, relative to run images directory. */
  images: Partial<Record<'baseline' | 'current' | 'diff', string>>
  /** Current working baseline revision observed at admission. */
  workingRevision: string | null
  /** Deliberate failure reason. */
  error?: string
  /** Non-blocking environment warning. */
  warning?: string
  /** Baseline successfully approved after this capture. */
  approved?: boolean
}

/** Persisted comparison summary, also consumed by standalone HTML report. */
export interface HistoireVisualRunSummary {
  /** Opaque run identity. */
  id: string
  /** Platform namespace. */
  platform: string
  /** Working tree or requested Git ref. */
  baselineSource: string
  /** Pinned Git commit when requested. */
  baselineCommit?: string
  /** Public lifecycle. */
  state: 'running' | 'completed' | 'cancelled'
  /** Detached case/profile outcomes. */
  results: HistoireVisualResult[]
  /** Planned comparisons. */
  total: number
  /** Run JSON location relative to project root; not written when incremental run captured nothing. */
  reportPath: string
  /** Run HTML location relative to project root; not written when incremental run captured nothing. */
  htmlPath: string
  /** True when every comparison passed or was approved. */
  ok: boolean
  /** Retired source or transport cannot approve retained images. */
  stale?: boolean
  /** Incremental runs: comparisons skipped because valid evidence exists; failing ones await review. */
  reused?: { total: number, failing: number }
}

/** Explicit retained-image approval request; never recaptures. */
export interface HistoireVisualApproveOptions {
  /** Completed run identity. */
  runId: string
  /** Explicitly reviewed result identities. */
  resultIds: string[]
}

/** Per-result approval preserves partial successes and conflicts. */
export interface HistoireVisualApprovalReceipt {
  /** Requested result. */
  resultId: string
  /** Persisted or rejected outcome. */
  status: 'approved' | 'conflict' | 'error'
  /** Failure reason when unsuccessful. */
  error?: string
}

/** Public Node visual operations require a ready development source. */
export interface HistoireProjectVisual {
  /** Current automatic variants and saved Matrix cases. */
  listCases: () => Promise<HistoireVisualCase[]>
  /** Capture and compare through project-owned execution lane. */
  run: (options?: HistoireVisualRunOptions) => Promise<HistoireVisualRunSummary>
  /** Approve exact completed captures with conflict checks. */
  approve: (options: HistoireVisualApproveOptions) => Promise<HistoireVisualApprovalReceipt[]>
}
