/**
 * HTTP request record (slice 06). Type-and-constant only so the parent can load it before
 * binding its listener. A record holds no query, header, cookie, body or credential.
 */

/** How a public HTTP exchange ended. */
export type RequestOutcome = 'completed' | 'failed' | 'aborted'

/** Retained summary of one public HTTP exchange. */
export interface RequestRecord {
  /** Stable, strictly increasing session identifier (parent-assigned). */
  id: number
  /** HTTP method. */
  method: string
  /** Sanitized pathname without query or fragment, possibly cut at {@link REQUEST_BOUNDS.pathLength}. */
  pathname: string
  /** Response status when headers were sent. */
  status?: number
  /** Completed, failed (5xx or proxy failure) or aborted (client response incomplete). */
  outcome: RequestOutcome
  /** Monotonic duration in milliseconds. */
  durationMs: number
}

/** Bounds of request retention beyond the 500 completed entries of the shared contract. */
export const REQUEST_BOUNDS = {
  /** Longest retained pathname (UTF-16 units). */
  pathLength: 1024,
  /** Longest retained method. */
  methodLength: 16,
  /** In-flight exchanges tracked at once; older ones stop being tracked but still produce their record when they end. */
  inFlight: 256,
} as const
