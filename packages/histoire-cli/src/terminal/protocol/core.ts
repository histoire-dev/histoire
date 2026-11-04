import { isIdentifier, RUNTIME_FRAME_MAX_BYTES, RUNTIME_ID_MAX_LENGTH } from '@histoire/dev-proxy/protocol'

/**
 * Shared terminal protocol primitives. Constants and tiny helpers only, so the
 * parent can load this module before binding its listener.
 */

/** Frozen numeric bounds; later slices must not exceed them. */
export const TERMINAL_BOUNDS = {
  /** Largest serialized `runtime-*` frame. */
  frameBytes: RUNTIME_FRAME_MAX_BYTES,
  /** Longest correlation, operation or target identifier. */
  idLength: RUNTIME_ID_MAX_LENGTH,
  /** Pending parent reads per generation before immediate `busy` rejection. */
  pendingReads: 32,
  /** Default read timeout. */
  readTimeoutMs: 10_000,
  /** Longest text (UTF-16 units) of one structured log event or retained line. */
  logTextLength: 16 * 1024,
  /** Retained log entries. */
  logEntries: 2000,
  /** Retained sanitized log text in UTF-8 bytes. */
  logBytes: 2 * 1024 * 1024,
  /** Retained HTTP request records. */
  requestEntries: 500,
  /** Completed test runs retained per owner. */
  testRuns: 20,
  /** Retained test summaries and fetched result data per owner, in bytes. */
  testBytes: 8 * 1024 * 1024,
  /** Largest page of catalog items or test cases. */
  pageItems: 100,
} as const

/** Stable failure codes shared by bridge and handlers. */
export type TerminalErrorCode =
  /** Operation name is not registered in the child. */
  | 'unsupported'
  /** Arguments or frame violate contract bounds. */
  | 'invalid'
  /** Too many reads pending for the generation. */
  | 'busy'
  /** Read exceeded its deadline; admitted work is not cancelled. */
  | 'timeout'
  /** Generation retired (restart, exit, shutdown) before an answer. */
  | 'retired'
  /** No ready runtime currently accepts commands. */
  | 'unavailable'
  /** Bridge was closed. */
  | 'closed'
  /** Handler failed. */
  | 'failed'

/** Error carrying a stable code across the private channel. */
export class TerminalError extends Error {
  /**
   * Creates a coded failure.
   * @param code Stable machine-readable code.
   * @param message Short human-readable detail.
   */
  constructor(readonly code: TerminalErrorCode, message: string) {
    super(message)
    this.name = 'TerminalError'
  }
}

/** Level of a structured log record. */
export type TerminalLogLevel = 'log' | 'info' | 'debug' | 'warn' | 'error'

/** Payload of the `log` runtime event: one intercepted console emission. */
export interface TerminalLogEvent {
  /** Console level; stream-only emissions fall back to `log` or `error`. */
  level: TerminalLogLevel
  /** Formatted, possibly multiline text without trailing newline. */
  text: string
  /** Characters removed by the 16 KiB event bound, when truncated. */
  truncated?: number
}

/** Definition of one request/response operation. */
export interface TerminalOperationDefinition<Args = unknown, Result = unknown> {
  args: Args
  result: Result
}

/** Operation-name to definition map; every domain declares its own. */
export type TerminalOperationMap = Record<string, TerminalOperationDefinition>

/** Event-name to payload map; every domain declares its own. */
export type TerminalEventMap = object

/** Operations owned by the core protocol (none yet). */
export type CoreOperations = Record<never, TerminalOperationDefinition>

/** Events owned by the core protocol. */
export interface CoreEvents {
  /** Intercepted child console emission. */
  log: TerminalLogEvent
}

/** Whether a value is a valid operation/correlation/target identifier; the bound is the transport's. */
export const isTerminalId: (value: unknown) => value is string = isIdentifier

/**
 * Cuts text to a character bound without splitting a surrogate pair.
 * @param text Text to bound.
 * @param max Maximum retained UTF-16 units.
 * @returns Retained text and number of removed units (0 when untouched).
 */
export function truncateText(text: string, max: number): { text: string, truncated: number } {
  if (text.length <= max) return { text, truncated: 0 }
  let end = max
  const last = text.charCodeAt(end - 1)
  if (last >= 0xD800 && last <= 0xDBFF) end--
  return { text: text.slice(0, end), truncated: text.length - end }
}

/**
 * Validates an untrusted `log` event payload from the child.
 * @param value Candidate payload.
 */
export function isTerminalLogEvent(value: unknown): value is TerminalLogEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Record<string, unknown>
  return typeof event.text === 'string' && ['log', 'info', 'debug', 'warn', 'error'].includes(event.level as string) && (event.truncated === undefined || typeof event.truncated === 'number')
}

/**
 * Throws the contracted invalid-argument error.
 * @param message Short human-readable detail.
 */
export function invalidArgument(message: string): never {
  throw new TerminalError('invalid', message)
}

/**
 * Requires untrusted arguments to be a plain object.
 * @param value Detached JSON from the parent.
 */
export function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalidArgument('Arguments must be an object')
  return value as Record<string, unknown>
}

/**
 * Rejects unknown keys so typos cannot silently widen a request.
 * @param value Validated argument object.
 * @param allowed Accepted key names.
 */
export function rejectUnknownKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) invalidArgument(`Unknown argument: ${key.slice(0, 40)}`)
  }
}
