import { Buffer } from 'node:buffer'

/** Public lifecycle, also used by SDK compatibility adapters. */
export type RuntimeStatus = 'starting' | 'ready' | 'restarting' | 'failed' | 'closed'

/** Configuration bytes captured at evaluation, encoded only for private IPC. */
export interface WatchInput {
  /** Absolute local configuration/dependency path. */
  file: string
  /** Source shown in terminal diagnostics. */
  source: string
  /** Base64 bytes; null records a missing file. */
  bytes: string | null
}

/** Browser-safe snapshot; excludes backend address, process IDs and secrets. */
export interface PublicState {
  /** Current availability. */
  status: RuntimeStatus
  /** Opaque process generation. */
  generation: string
  /** Current application mount. */
  base: string
  /** Short failure detail, when startup failed. */
  error?: string
}

/** Why a runtime generation is being replaced. */
export type RestartCauseKind =
  /** Explicit request by the embedding application (keyboard, API). */
  | 'manual'
  /** A watched configuration or dependency file changed; `source` labels it. */
  | 'config'
  /** The served page asked for a restart. */
  | 'browser'
  /** The runtime process exited unexpectedly; `source` carries the exit detail. */
  | 'exit'
  /** The runtime asked to be replaced by a new process (e.g. after a plugin change); `source` labels why. */
  | 'runtime'

/** Observed reason of one restart transition, delivered once per transition. */
export interface RestartCause {
  kind: RestartCauseKind
  /** Short origin label (watched file source or exit detail). */
  source?: string
  /** The next generation skips cached catalog restoration and forces dependency optimization. */
  fresh: boolean
}

/** Input of a restart request; omitted fields mean an ordinary manual restart. */
export interface RestartRequest {
  cause?: RestartCauseKind
  source?: string
  /** Request a one-shot fresh next generation; never lost when coalesced with another cause. */
  fresh?: boolean
}

/** Frozen bounds for generic runtime frames; payload semantics belong to the framework adapter. */
export const RUNTIME_FRAME_MAX_BYTES = 256 * 1024
/** Longest accepted runtime restart label. */
export const RESTART_SOURCE_MAX_LENGTH = 200
/** Longest accepted correlation, operation and event identifier. */
export const RUNTIME_ID_MAX_LENGTH = 100

/** Framework-neutral request carried to the current generation only. */
export interface RuntimeCommand {
  type: 'runtime-command'
  /** Generation the sender believes is current; receivers ignore mismatches. */
  generation: string
  /** Correlation identifier echoed by the matching reply. */
  id: string
  /** Recognized operation name, validated by the framework adapter. */
  operation: string
  /** Detached JSON arguments. */
  args?: unknown
}

/** Failure carried by a negative runtime reply. */
export interface RuntimeFailure {
  /** Stable machine-readable code. */
  code: string
  /** Short human-readable detail. */
  message: string
}

/** Correlated answer to one runtime command. */
export type RuntimeReply = { type: 'runtime-reply', generation: string, id: string } & ({ ok: true, result?: unknown } | { ok: false, error: RuntimeFailure })

/** Uncorrelated generation-scoped observation. */
export interface RuntimeEvent {
  type: 'runtime-event'
  generation: string
  /** Recognized event name. */
  event: string
  /** Detached JSON payload. */
  data?: unknown
}

/** Why a command could not be handed to a runtime process. */
export type RuntimeSendFailure = 'starting' | 'restarting' | 'failed' | 'closed'

/** Outcome of handing a command to the current ready runtime. */
export type RuntimeSendResult = { ok: true, generation: string } | { ok: false, reason: RuntimeSendFailure }

/** Raw runtime stream observation; an absent chunk marks the end of that stream. */
export interface RuntimeOutput {
  stream: 'stdout' | 'stderr'
  generation: string
  chunk?: Buffer
}

/** Parent starts one runtime exactly once and requests graceful winddown. */
export type ParentMessage = { type: 'start', generation: string, publicOrigin: string, options: Record<string, unknown>, token?: string } | { type: 'address', generation: string, publicOrigin: string } | { type: 'shutdown' } | RuntimeCommand

/** Public address asked by project configuration; command-line values win. */
export interface ConfiguredAddress {
  /** Unvalidated project port, checked only if the CLI did not override it. */
  port?: unknown
  /** Unvalidated project host, checked only if the CLI did not override it. */
  host?: unknown
}

/** Runtime reports observations; only parent decides public availability/restarts. */
export type ChildMessage =
  | { type: 'watch', generation: string, inputs: WatchInput[], complete?: boolean }
  /** Configured public address, sent before the runtime pins its origin; parent answers with the final one. */
  | ({ type: 'address', generation: string } & ConfiguredAddress)
  | { type: 'ready', generation: string, target: string, base: string, open?: boolean | string }
  | { type: 'failed', generation: string, error: string }
  /** Ready runtime asks the parent for a full process replacement; only the parent restarts. */
  | { type: 'restart', generation: string, source: string, fresh?: boolean }
  | RuntimeReply
  | RuntimeEvent

/** Non-empty identifier within the frozen length bound. */
export function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= RUNTIME_ID_MAX_LENGTH
}

/** Serialized frames above the frozen bound (or unserializable ones) are rejected. */
export function isBoundedFrame(value: unknown): boolean {
  try {
    return Buffer.byteLength(JSON.stringify(value)) <= RUNTIME_FRAME_MAX_BYTES
  }
  catch {
    return false
  }
}

/**
 * Whether the child will accept a command: identifiers within bounds, and the frame still within
 * its bound once wrapped in the `runtime-command` envelope it travels in (generation of the longest
 * accepted length). Senders refuse anything else up front instead of waiting for a dropped reply.
 * @param command Correlation ID, operation and arguments of the command.
 */
export function isBoundedCommand(command: Omit<RuntimeCommand, 'type' | 'generation'>): boolean {
  return isIdentifier(command.id) && isIdentifier(command.operation) && isBoundedFrame({ ...command, type: 'runtime-command', generation: 'x'.repeat(RUNTIME_ID_MAX_LENGTH) } satisfies RuntimeCommand)
}

/** Accept a finite, bounded command addressed to the receiving generation. */
export function isRuntimeCommand(value: unknown): value is RuntimeCommand {
  if (!value || typeof value !== 'object') return false
  const message = value as Record<string, unknown>
  return message.type === 'runtime-command' && isIdentifier(message.generation) && isIdentifier(message.id) && isIdentifier(message.operation) && isBoundedFrame(value)
}

/**
 * Whether a child-sent workbench base is a same-origin absolute path. Backslashes are rejected
 * because URL parsers treat them as slashes (`/\\evil.com` resolves to another host).
 */
export function isSafeBase(base: unknown): base is string {
  if (typeof base !== 'string' || !base.startsWith('/') || base.startsWith('//') || base.includes('\\')) return false
  try {
    return new URL(base, 'http://x').origin === 'http://x'
  }
  catch {
    return false
  }
}

/** Accept finite, generation-scoped frames before dispatching across IPC. */
export function isChildMessage(value: unknown): value is ChildMessage {
  if (!value || typeof value !== 'object') return false
  const message = value as Record<string, unknown>
  if (typeof message.generation !== 'string' || message.generation.length > 100) return false
  if (message.type === 'runtime-reply') {
    if (!isIdentifier(message.id) || typeof message.ok !== 'boolean') return false
    const error = message.error as Record<string, unknown> | undefined
    if (!message.ok && !(error && isIdentifier(error.code) && typeof error.message === 'string' && error.message.length <= 4096)) return false
    return isBoundedFrame(value)
  }
  if (message.type === 'runtime-event') return isIdentifier(message.event) && isBoundedFrame(value)
  if (message.type === 'address') return isBoundedFrame(value)
  if (message.type === 'failed') return typeof message.error === 'string' && message.error.length <= 4096
  if (message.type === 'restart') return typeof message.source === 'string' && message.source.length > 0 && message.source.length <= RESTART_SOURCE_MAX_LENGTH && (message.fresh === undefined || typeof message.fresh === 'boolean')
  if (message.type === 'ready') return typeof message.target === 'string' && /^http:\/\/127\.0\.0\.1:\d+$/.test(message.target) && isSafeBase(message.base)
  return message.type === 'watch' && Array.isArray(message.inputs) && message.inputs.length <= 10000 && message.inputs.every(input => input && typeof input.file === 'string' && typeof input.source === 'string' && (input.bytes === null || typeof input.bytes === 'string'))
}
