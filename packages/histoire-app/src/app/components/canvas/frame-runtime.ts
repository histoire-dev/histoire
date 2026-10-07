import type { HistoireSession } from '@histoire/sdk'
import type { CanvasFrameState } from './frame-state.js'
import { getHistoireTargetKey } from '@histoire/protocol'
import { getCanvasTargetGeneration } from './frame-source.js'

/** State and readiness callbacks belong to one mounted runtime, never to canvas selection. */
export interface CanvasFrameRuntimeOptions {
  /** Ordinary variant cache; Matrix override cells deliberately omit it. */
  state?: CanvasFrameState
  /** Physical document owns freshest retained state; URL/runtime ID can survive a reload. */
  document?: () => Document | null | undefined
  /** Runtime is unavailable or restoring retained state. */
  loading: () => void
  /** Exact document has finished restoration and can accept inspector operations. */
  ready: (snapshot: ReturnType<HistoireSession['getSnapshot']>) => void
  /** Current runtime failed; caller owns frame-local error presentation. */
  error: (error?: unknown) => void
}

/** Restore each runtime generation once before publishing readiness or capturing fresh state. */
export function observeCanvasFrameRuntime(owner: HistoireSession, options: CanvasFrameRuntimeOptions): () => void {
  let active = true
  let generation = 0
  let initialized = ''
  let preparing = ''
  let stopState = () => {}
  let stateDocument: Document | null | undefined
  const restored = new Set<string>()

  /** Runtime ID, exact target, and executable source jointly fence async restoration. */
  function identity(snapshot: ReturnType<HistoireSession['getSnapshot']>): string {
    const target = snapshot.selection
    const source = target && getCanvasTargetGeneration(snapshot, target)
    return snapshot.runtime.status === 'ready' && snapshot.runtime.runtimeId && source && target?.variantId
      ? JSON.stringify([snapshot.runtime.runtimeId, getHistoireTargetKey(target), source])
      : ''
  }

  /** A delayed patch must never publish readiness for its replacement document. */
  async function initialize(key: string, token: number): Promise<void> {
    try {
      const target = owner.getSnapshot().selection!
      const document = options.document?.()
      if (document !== stateDocument) {
        stateDocument = document
        restored.clear()
      }
      // A reused document retains newer edits than the asynchronous host mirror.
      // Seed each target once, but always seed again after physical navigation.
      if (!document || !restored.has(key)) await options.state?.seed(owner, target)
      if (!active || token !== generation || identity(owner.getSnapshot()) !== key) return
      if (document !== options.document?.()) return
      if (document) restored.add(key)
      initialized = key
      preparing = ''
      stopState = options.state?.observe(owner) ?? (() => {})
      options.ready(owner.getSnapshot())
    }
    catch (error) {
      if (active && token === generation) {
        preparing = ''
        options.error(error)
      }
    }
  }

  /** Source-owned transitions retire capture before a new document publishes its defaults. */
  function synchronize(snapshot: ReturnType<HistoireSession['getSnapshot']>): void {
    if (!active) return
    const key = identity(snapshot)
    if (!key) {
      generation++
      initialized = preparing = ''
      stopState()
      stopState = () => {}
      if (snapshot.runtime.status === 'failed') options.error()
      else options.loading()
    }
    else if (initialized === key) {
      options.ready(snapshot)
    }
    else if (preparing !== key) {
      stopState()
      stopState = () => {}
      initialized = ''
      preparing = key
      options.loading()
      void initialize(key, ++generation)
    }
  }

  const stop = owner.subscribe(synchronize)
  synchronize(owner.getSnapshot())
  return () => {
    active = false
    generation++
    stop()
    stopState()
  }
}
