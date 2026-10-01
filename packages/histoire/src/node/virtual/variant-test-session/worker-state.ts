/** Slice of Vitest's worker used by the preview and real browser harness. */
interface VitestWorkerState {
  /** File attributed to the current task. */
  filepath?: string
  /** Real Vitest task or the embedded preview task. */
  current?: any
  /** Resolved Vitest runtime settings used by embedded hooks. */
  config?: {
    /** Default hook deadline in milliseconds. */
    hookTimeout?: number
    /** Default test deadline in milliseconds. */
    testTimeout?: number
  }
}

/** Reads the worker installed by Vitest or preview bootstrap. */
export function getVitestWorkerState(): VitestWorkerState | undefined {
  return (globalThis as typeof globalThis & { __vitest_worker__?: VitestWorkerState }).__vitest_worker__
}
