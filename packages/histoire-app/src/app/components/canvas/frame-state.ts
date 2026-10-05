import type { HistoireTarget } from '@histoire/protocol'
import type { HistoireSession } from '@histoire/sdk'
import { getHistoireTargetKey } from '@histoire/protocol'
import { getCanvasTargetGeneration } from './frame-source.js'

/** Observe exact recursively readonly snapshot contract supplied by SDK session. */
type CanvasSourceSnapshot = ReturnType<HistoireSession['getSnapshot']>

/** Cached projection is owned by one canonical source generation and exact target. */
interface RetainedFrameState {
  /** Exact tuple owner; no slash-separated identifiers. */
  target: HistoireTarget
  /** Book lifetime and executable story identity. */
  generation: string
  /** Cleaned serializable fields; runtime-owned control definitions are excluded. */
  value: Record<string, unknown>
}

/** Retain canonical edits for display replicas without letting passive state become authority. */
export function createCanvasFrameState(canonical: HistoireSession) {
  const entries = new Map<string, RetainedFrameState>()
  let lastState: CanvasSourceSnapshot['state'] | undefined
  let closed = false
  /** Catalog invalidation runs before state capture; reused mirrors are never fresh authority. */
  function capture(snapshot: CanvasSourceSnapshot): void {
    for (const [key, entry] of entries) {
      if (getCanvasTargetGeneration(snapshot, entry.target) !== entry.generation) entries.delete(key)
    }
    const state = snapshot.state
    if (state === lastState) return
    lastState = state
    if (!state || snapshot.runtime.status !== 'ready' || state.runtimeId !== snapshot.runtime.runtimeId
      || state.target.storyId !== snapshot.selection?.storyId || state.target.variantId !== snapshot.selection?.variantId || Array.isArray(state.value)) {
      return
    }
    const generation = getCanvasTargetGeneration(snapshot, state.target)
    if (!generation) return
    // Array roots were rejected above; cloning makes this retained record independently mutable.
    const value = structuredClone(state.value) as Record<string, unknown>
    delete value._hPropDefs
    entries.set(getHistoireTargetKey(state.target), { target: { ...state.target }, generation, value })
  }
  capture(canonical.getSnapshot())
  const stop = canonical.subscribe(capture)
  /** Read a detached patch only while canonical source still owns cached story generation. */
  function getPatch(target: HistoireTarget): Record<string, unknown> | undefined {
    const entry = entries.get(getHistoireTargetKey(target))
    if (!closed && entry && getCanvasTargetGeneration(canonical.getSnapshot(), target) === entry.generation) return structuredClone(entry.value)
  }
  return {
    getPatch,
    /** Seed only ready passive document for same target and source; canonical session is untouched. */
    async seed(replica: HistoireSession, target: HistoireTarget): Promise<void> {
      const destination = replica.getSnapshot()
      const entry = entries.get(getHistoireTargetKey(target))
      if (!entry || destination.runtime.status !== 'ready' || destination.selection?.storyId !== target.storyId || destination.selection.variantId !== target.variantId
        || getCanvasTargetGeneration(destination, target) !== entry.generation) {
        return
      }
      const patch = getPatch(target)
      if (patch && Object.keys(patch).length) await replica.state.patch(patch)
    },
    /** Provider teardown releases canonical listener and retained target projections. */
    dispose(): void {
      closed = true
      stop()
      entries.clear()
    },
  }
}

/** Retained state remains scoped to nearest mounted canvas. */
export type CanvasFrameState = ReturnType<typeof createCanvasFrameState>
