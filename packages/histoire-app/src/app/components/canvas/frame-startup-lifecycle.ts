import type { HistoireSession } from '@histoire/sdk'
import type { CanvasFrameState } from './frame-state.js'
import { observeCanvasFrameRuntime } from './frame-runtime.js'
import { getCanvasTargetGeneration } from './frame-source.js'

/** Guards and callbacks for one frame's restored startup observer. */
export interface CanvasStartupRuntimeOptions {
  /** Isolated runtime that owns this observer. */
  owner: HistoireSession
  /** Canonical source used to validate the target generation. */
  canonical: HistoireSession
  /** Ordinary frame state; Matrix sessions deliberately omit it. */
  state?: CanvasFrameState
  /** Exact frame target owned by this component. */
  target: () => { storyId: string, variantId: string }
  /** Physical document used to distinguish retained runtime generations. */
  document: () => Document | null | undefined
  /** Reject callbacks from a retired component generation. */
  isCurrent: () => boolean
  /** Distinguish initial readiness errors from later runtime failures. */
  isStartupPending: () => boolean
  /** Publish loading while this component still owns the runtime. */
  loading: () => void
  /** Publish runtime failure and reject pending coordinator readiness. */
  error: (error?: unknown) => void
  /** Reject startup when ready publication belongs to a stale target or source. */
  startupFailure: (error: unknown) => void
  /** Publish readiness after host state restoration. */
  ready: (snapshot: ReturnType<HistoireSession['getSnapshot']>) => void
}

/** Current selection owner and activation for one replica frame. */
export interface CanvasTargetSelectionActivation {
  /** Isolated session receiving selection and settings updates. */
  session?: HistoireSession
  /** Startup generation that owns this request. */
  generation: number
  /** Latest exact target from current component props. */
  target: { storyId: string, variantId: string }
  /** Whether the runtime connection can accept selection commands. */
  connected: boolean
  /** Whether component teardown has started. */
  closing: boolean
}

/** Inputs for one replica's latest-intent selection controller. */
export interface CanvasTargetSelectorOptions {
  /** Read live props and session ownership for every target change. */
  activation: () => CanvasTargetSelectionActivation
  /** Current presentation settings to apply with the selected target. */
  settings: () => Parameters<HistoireSession['settings']['update']>[0]
  /** Publish loading while the component remains current. */
  loading: () => void
  /** Publish selection failure while the component remains current. */
  fail: (error: unknown) => void
}

/** Selection methods and invalidation hooks for replica startup. */
export interface CanvasTargetSelector {
  /** Select latest target and optionally propagate a failure to startup owner. */
  select: (propagate?: boolean, reportLoading?: boolean) => Promise<void>
  /** Retire intent when a new startup activation supersedes the prior one. */
  invalidate: () => void
  /** Read current intent for mount error fencing. */
  currentIntent: () => number
}

/** Bind readiness to exact target and source generation before releasing admission. */
export function observeCanvasStartupRuntime(options: CanvasStartupRuntimeOptions): () => void {
  return observeCanvasFrameRuntime(options.owner, {
    state: options.state,
    document: options.document,
    loading() {
      if (options.isCurrent()) options.loading()
    },
    error(error) {
      const target = options.owner.getSnapshot().selection
      const expected = options.target()
      if (options.isCurrent() && target?.storyId === expected.storyId && target.variantId === expected.variantId) options.error(error)
    },
    ready(snapshot) {
      if (!options.isCurrent()) return
      const target = snapshot.selection
      const expected = options.target()
      if (target?.storyId !== expected.storyId || target.variantId !== expected.variantId) {
        if (options.isStartupPending()) options.startupFailure(new Error('Variant changed while loading.'))
        return
      }
      if (getCanvasTargetGeneration(snapshot, target) !== getCanvasTargetGeneration(options.canonical.getSnapshot(), target)) {
        if (options.isStartupPending()) options.startupFailure(new Error('Variant source changed while loading.'))
        return
      }
      options.ready(snapshot)
    },
  })
}

/** Keep selection/settings updates scoped to the latest live component intent. */
export function createCanvasReplicaTargetSelector(options: CanvasTargetSelectorOptions): CanvasTargetSelector {
  let intent = 0

  /** Retire selection failures belonging to an older startup activation. */
  function invalidate(): void {
    intent++
  }

  /** Read current selection token for mount failure fencing. */
  function currentIntent(): number {
    return intent
  }

  /** Publish only the most recent selection failure for this live session. */
  async function select(propagate = false, reportLoading = true): Promise<void> {
    const activation = options.activation()
    const requestIntent = ++intent
    if (reportLoading) options.loading()
    if (!activation.session || !activation.connected) return
    try {
      const selected = activation.session.selection.select(activation.target)
      await Promise.all([selected, activation.session.settings.update(options.settings())])
    }
    catch (error) {
      const current = options.activation()
      const isCurrent = !current.closing
        && requestIntent === intent
        && activation.generation === current.generation
        && activation.session === current.session
      if (isCurrent) {
        options.fail(error)
        if (propagate) throw error
      }
    }
  }

  return { select, invalidate, currentIntent }
}

/** Deferred runtime readiness owned by one coordinator activation. */
export interface CanvasStartupReadiness {
  /** Resolves only after runtime restoration and mount readiness both complete. */
  promise: Promise<void>
  /** Publish restored runtime readiness. */
  ready: () => void
  /** Publish startup failure while readiness remains pending. */
  fail: (error: unknown) => void
  /** Remove abort listener after task completion. */
  dispose: () => void
}

/** Create a readiness latch that retires with its startup signal. */
export function createCanvasStartupReadiness(signal: AbortSignal): CanvasStartupReadiness {
  let settled = false
  let resolvePromise!: () => void
  let rejectPromise!: (error: unknown) => void
  const promise = new Promise<void>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })
  void promise.catch(() => {})
  /** Settle this activation once, regardless of late host callbacks. */
  function settle(isReady: boolean, error?: unknown): void {
    if (settled) return
    settled = true
    if (isReady) resolvePromise()
    else rejectPromise(error)
  }
  /** Cancellation rejects readiness so pending mount waits begin teardown. */
  function abort(): void {
    settle(false, signal.reason ?? new DOMException('Aborted', 'AbortError'))
  }
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) abort()
  return {
    promise,
    ready: () => settle(true),
    fail: error => settle(false, error),
    dispose: () => signal.removeEventListener('abort', abort),
  }
}

/** Race an owned wait against cancellation without leaving a listener behind. */
export async function waitForCanvasStartup<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  let abort!: () => void
  const cancelled = new Promise<never>((_, reject) => {
    abort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
    signal.addEventListener('abort', abort, { once: true })
  })
  try {
    const result = await Promise.race([promise, cancelled])
    signal.throwIfAborted()
    return result
  }
  finally {
    signal.removeEventListener('abort', abort)
  }
}
