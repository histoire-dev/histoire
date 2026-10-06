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

/** Retain editable state from exact frame owners; canonical session supplies source authority. */
export function createCanvasFrameState(canonical: HistoireSession) {
  const entries = new Map<string, RetainedFrameState>()
  const seen = new WeakSet<object>()
  const observers = new Set<() => void>()
  let closed = false
  /** Source invalidation never recaptures an old runtime mirror as new defaults. */
  function invalidate(snapshot: CanvasSourceSnapshot): void {
    for (const [key, entry] of entries) {
      if (getCanvasTargetGeneration(snapshot, entry.target) !== entry.generation) entries.delete(key)
    }
  }
  /** Only a ready exact runtime can update its target's retained editable fields. */
  function capture(snapshot: CanvasSourceSnapshot): void {
    const state = snapshot.state
    if (closed || !state || snapshot.runtime.status !== 'ready' || state.runtimeId !== snapshot.runtime.runtimeId
      || state.target.storyId !== snapshot.selection?.storyId || state.target.variantId !== snapshot.selection?.variantId || Array.isArray(state.value)) {
      return
    }
    const generation = getCanvasTargetGeneration(snapshot, state.target)
    if (!generation || generation !== getCanvasTargetGeneration(canonical.getSnapshot(), state.target)) return
    if (seen.has(state)) return
    seen.add(state)
    // Array roots were rejected above; cloning makes this retained record independently mutable.
    const value = structuredClone(state.value) as Record<string, unknown>
    delete value._hPropDefs
    entries.set(getHistoireTargetKey(state.target), { target: { ...state.target }, generation, value })
  }
  const stop = canonical.subscribe(invalidate)
  /** Read a detached patch only while canonical source still owns cached story generation. */
  function getPatch(target: HistoireTarget): Record<string, unknown> | undefined {
    const entry = entries.get(getHistoireTargetKey(target))
    if (!closed && entry && getCanvasTargetGeneration(canonical.getSnapshot(), target) === entry.generation) return structuredClone(entry.value)
  }
  return {
    getPatch,
    /** Observe only after seeding, so boot defaults cannot overwrite retained edits. */
    observe(owner: HistoireSession): () => void {
      if (closed) return () => {}
      let active = true
      const unsubscribe = owner.subscribe(snapshot => active && capture(snapshot))
      /** Retired callbacks cannot capture late state from their former owner. */
      function release(): void {
        active = false
        unsubscribe()
        observers.delete(release)
      }
      observers.add(release)
      capture(owner.getSnapshot())
      return release
    },
    /** Restore ready exact runtime before observing its state, without selecting another target. */
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
      for (const release of observers) release()
      entries.clear()
    },
  }
}

/** Retained state remains scoped to nearest mounted canvas. */
export type CanvasFrameState = ReturnType<typeof createCanvasFrameState>
