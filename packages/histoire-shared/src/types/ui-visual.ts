import type { HistoireVisualApprovalReceipt, HistoireVisualApproveOptions, HistoireVisualCaptureSpec, HistoireVisualCase, HistoireVisualResult, HistoireVisualRunOptions, HistoireVisualRunSummary } from './visual.js'

/** Review identity excludes props/axes, retained privately for replay and approval. */
export type UiVisualCase = Omit<HistoireVisualCase, 'propsOverride' | 'axes'>

/** Review images and status need profile identity, not repeated rendering inputs. */
export type UiVisualResult = Omit<HistoireVisualResult, 'case' | 'spec' | 'workingRevision'> & {
  /** Exact case identity and human-readable target. */
  case: UiVisualCase
  /** Named comparison profile. */
  spec: Pick<HistoireVisualCaptureSpec, 'id'>
  /** Original artifact owner, independent of currently running capture. */
  artifactRunId?: string
  /** Stable case/profile/source namespace for merging latest evidence. */
  comparisonKey?: string
  /** Persisted capture time. */
  capturedAt?: string
  /** Evidence recovered from a previous workbench session. */
  restored?: boolean
  /** Revalidation failure; historical pixels remain reviewable. */
  staleReason?: string
  /** Baseline source used by this capture. */
  baselineSource?: string
  /** Actual pinned Git commit used by this capture. */
  baselineCommit?: string
  /** Browser-local server-issued approval authority. */
  reviewHandle?: string
}

/** Bounded review pages leave full capture authority on server. */
export type UiVisualRun = Omit<HistoireVisualRunSummary, 'results'> & {
  /** Compact comparison rows. */
  results: UiVisualResult[]
}

/** Small correlated commands use existing bounded dev transport. */
export type UiVisualRequest = { requestId: string } & (
  | { action: 'recover', offset?: number }
  | { action: 'approve-review', selections: { handle: string, resultId: string }[] }
  | { action: 'inventory', offset?: number }
  | { action: 'save', case: Omit<HistoireVisualCase, 'id' | 'kind' | 'schemaVersion'> }
  | { action: 'remove', caseId: string }
  | { action: 'run', options?: Omit<HistoireVisualRunOptions, 'signal'> }
  | { action: 'cancel', runId: string }
  | { action: 'results', runId: string, offset?: number }
  | { action: 'approve', options: HistoireVisualApproveOptions }
)

/** Metadata pages and summary updates never put PNG bytes on WebSocket. */
export interface UiVisualReply {
  /** Exact originating request identity. */
  requestId: string
  /** Current inventory page. */
  inventory?: { cases: UiVisualCase[], total: number, nextOffset?: number, profiles: { id: string }[], baselineRef: string }
  /** Save receipt. */
  case?: UiVisualCase
  /** Summary or page of retained comparisons. */
  run?: UiVisualRun
  /** Paginated historical collection, independent of active run. */
  recovered?: { results: UiVisualResult[], total: number, nextOffset?: number, issues: string[] }
  /** Completed comparison count independently from page size. */
  completed?: number
  /** Result IDs an incremental run captures, streamed in budget-sized chunks before its progress. */
  planned?: string[]
  /** Next result page. */
  nextOffset?: number
  /** Exact approval receipts. */
  receipts?: HistoireVisualApprovalReceipt[]
  /** False streams durable approval receipts; true settles approval request. Other replies omit. */
  done?: boolean
  /** Deliberate failure reason. */
  error?: string
}
