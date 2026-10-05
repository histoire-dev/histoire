import type { HistoireErrorCode } from '@histoire/protocol'

/** Browser service exposes existing portable codes, without transport schemas. */
export type PreviewErrorCode = Extract<HistoireErrorCode, 'DEPENDENCY_MISSING' | 'BROWSER_UNAVAILABLE' | 'PREVIEW_NOT_READY' | 'RESULT_TOO_LARGE' | 'CANCELLED' | 'TIMEOUT' | 'INTERNAL_ERROR'>

/** Capture lifecycle error, independent of transport schemas or SDK packages. */
export class PreviewError extends Error {
  /** Stable service failure reason. */
  readonly code: PreviewErrorCode
  /** Whether changed external state may allow a later caller attempt. */
  readonly retryable: boolean

  /** Retains deliberate public message without exposing browser causes. */
  constructor(code: PreviewErrorCode, message: string, retryable = false) {
    super(message)
    this.name = 'PreviewError'
    this.code = code
    this.retryable = retryable
  }
}
