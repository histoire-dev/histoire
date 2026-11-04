import type { TerminalLogLevel } from '../protocol/core.js'
import { createBoundedHistory } from '../history/bounded.js'
import { TERMINAL_BOUNDS } from '../protocol/core.js'

/** Where a retained record came from. */
export type LogSource = 'stdout' | 'stderr' | 'console' | 'diagnostic'

/** Sanitized, retained log entry. */
export interface LogRecord {
  /** Stable, strictly increasing session identifier (survives eviction, clearing and restarts). */
  id: number
  /** Origin of the text. */
  source: LogSource
  /** Severity; raw stderr lines are `error`. */
  level: TerminalLogLevel
  /** Sanitized text, possibly multiline for console records. */
  text: string
  /** Characters dropped by a line bound, 0 otherwise. */
  truncated: number
  /** Runtime generation that produced it, when known. */
  generation?: string
}

/** Fields supplied when appending; `id` is assigned. */
export type LogInput = Omit<LogRecord, 'id'>

/** Bounded session log retention. */
export interface LogHistory {
  /** Retains a record, evicting oldest ones beyond the bounds. */
  append: (input: LogInput) => LogRecord
  /** Currently retained records, oldest first. */
  entries: () => readonly LogRecord[]
  /** Number of records evicted by bounds since the session began (not by `clear`). */
  readonly omitted: number
  /** Retained text size in UTF-8 bytes. */
  readonly bytes: number
  /** Deletes retained records; identifiers keep increasing. */
  clear: () => void
  /** Notifies after each append or clear; returns an unsubscribe function. */
  subscribe: (listener: () => void) => () => void
}

/**
 * Creates a session history bounded by entry count and sanitized UTF-8 bytes.
 * @param limits Overrides for tests; defaults are the frozen contract bounds.
 */
export function createLogHistory(limits: { entries?: number, bytes?: number } = {}): LogHistory {
  const history = createBoundedHistory<LogRecord>({ entries: limits.entries ?? TERMINAL_BOUNDS.logEntries, maxWeight: limits.bytes ?? TERMINAL_BOUNDS.logBytes, weigh: record => Buffer.byteLength(record.text) })
  return {
    get omitted() {
      return history.omitted
    },
    get bytes() {
      return history.weight
    },
    append: input => history.append(id => ({ ...input, id })),
    entries: history.entries,
    clear: history.clear,
    subscribe: history.subscribe,
  }
}
