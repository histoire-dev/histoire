/** Stable portable failure codes shared by SDK and Node adapters. */
export const HISTOIRE_ERROR_CODES = [
  'INVALID_ARGUMENT',
  'RESULT_TOO_LARGE',
  'BROWSER_REQUIRED',
  'NOT_CONNECTED',
  'DISPOSED',
  'CAPABILITY_UNAVAILABLE',
  'PROTOCOL_MISMATCH',
  'ORIGIN_DENIED',
  'BOOK_UNAVAILABLE',
  'STORY_NOT_FOUND',
  'STORY_AMBIGUOUS',
  'VARIANT_NOT_FOUND',
  'SELECTION_REQUIRED',
  'PREVIEW_NOT_READY',
  'RUNTIME_IN_USE',
  'STALE_REVISION',
  'RUNTIME_CHANGED',
  'DOCS_NOT_FOUND',
  'SOURCE_UNAVAILABLE',
  'COLLECTION_FAILED',
  'QUEUE_FULL',
  'RATE_LIMITED',
  'DEPENDENCY_MISSING',
  'BROWSER_UNAVAILABLE',
  'CANCELLED',
  'TIMEOUT',
  'INTERNAL_ERROR',
] as const

/** Error discriminator, not transport-specific exception classes. */
export type HistoireErrorCode = typeof HISTOIRE_ERROR_CODES[number]

/** Bounded JSON-safe error representation; no raw exception/path forwarding. */
export interface HistoireErrorData {
  /** Stable typed failure reason. */
  code: HistoireErrorCode
  /** Bounded human-readable failure. */
  message: string
  /** Optional bounded, explicitly projected diagnostic data. */
  details?: unknown
}

/** Shared typed exception reconstructed at client boundary. */
export class HistoireSdkError extends Error {
  /** Stable failure code. */
  readonly code: HistoireErrorCode
  /** Optional bounded projected diagnostic data. */
  readonly details?: unknown

  /** Constructs failure without importing platform/framework modules. */
  constructor(code: HistoireErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'HistoireSdkError'
    this.code = code
    this.details = details
  }
}
