import type { UiChannelError } from './ui-channel.js'

/** Cancellation admission response; accepted work still owns its terminal lifecycle. */
export interface UiMcpCancelResult {
  /** Exact operation submitted by this browser. */
  operationId: string
  /** Recoverable rejection without exposing private operation data. */
  error?: UiChannelError
}

declare module './ui-channel.js' {
  interface UiServerEvents {
    /** Private cancellation acceptance or explicit failure for requesting browser. */
    'histoire:ui:mcp-cancel-result': UiMcpCancelResult
  }
}
