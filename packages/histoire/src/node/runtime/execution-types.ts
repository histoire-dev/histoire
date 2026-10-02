/** One project-owned server execution state; terminal states follow cleanup. */
export type ExecutionState = 'queued' | 'running' | 'cancelling' | 'completed' | 'failed' | 'cancelled'

/** Work submitted by MCP or server-triggered UI tests to the same FIFO lane. */
export interface ExecutionTask<T> {
  /** Optional MCP identity used only for waiting-job quota accounting. */
  principal?: string
  /** Checks captured runtime authority immediately before execution. */
  validate?: () => void
  /** Starts resources only when this callback reaches the head of the lane. */
  run: (signal: AbortSignal) => T | Promise<T>
  /** Confirms all owned resources stopped, including after run failure. */
  cleanup?: () => void | Promise<void>
  /** Observes lifecycle after its state has changed. */
  onState?: (state: ExecutionState) => void
}

/** Per-submission cancellation and result, independent of SDK requests. */
export interface ExecutionHandle<T> {
  /** Current lane state. */
  readonly state: ExecutionState
  /** Settles only after confirmed cleanup. */
  readonly result: Promise<T>
  /** Requests abort without releasing active work's lane prematurely. */
  cancel: () => void
}

/** Controlled lane failures mapped to transport-domain errors by adapters. */
export class ExecutionError extends Error {
  /** Stable SDK-free scheduler category. */
  readonly code: 'QUEUE_FULL' | 'CANCELLED' | 'UNAVAILABLE' | 'CLEANUP_UNCONFIRMED'

  /** Retain original execution failure when teardown also fails. */
  constructor(code: ExecutionError['code'], message: string, cause?: unknown) {
    super(message, { cause })
    this.name = 'ExecutionError'
    this.code = code
  }
}
