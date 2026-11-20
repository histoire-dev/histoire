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

/** Browser spec teardown and settings that can invalidate a mount before the first case starts. */
interface BrowserMountState {
  /** Drained by Vitest after the tester finishes, even when no case ran. */
  cleanups?: (() => void)[]
  /** Setup must run after before-case resets when any of these are enabled. */
  config?: {
    /** Test-file isolation setting shared by v5 Node and browser projects. */
    isolate?: boolean
    browser?: { isolate?: boolean }
    clearMocks?: boolean
    mockReset?: boolean
    restoreMocks?: boolean
    unstubEnvs?: boolean
    unstubGlobals?: boolean
  }
}

/** Only isolated browser specs with confirmed teardown can retain the discovery mount. */
export function getVitestBrowserMountCleanups(): (() => void)[] | undefined {
  // Vitest drains these cleanups from the tester finalizer. Browser isolation
  // moved from browser.isolate in v4 to the shared isolate option in v5.
  const state = (globalThis as typeof globalThis & { __vitest_browser_runner__?: BrowserMountState }).__vitest_browser_runner__
  const config = state?.config
  if (!Array.isArray(state?.cleanups) || !(config?.browser?.isolate ?? config?.isolate)) return
  if (config.clearMocks || config.mockReset || config.restoreMocks || config.unstubEnvs || config.unstubGlobals) return
  return state.cleanups
}
