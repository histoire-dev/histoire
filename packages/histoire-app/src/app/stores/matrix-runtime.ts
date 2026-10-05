import type { HistoireReadonly, HistoireSnapshot, HistoireTarget } from '@histoire/protocol'
import type { MatrixAxis, MatrixProp } from '../util/matrix.js'
import { getHistoireTargetKey } from '@histoire/protocol'
import { getCanvasTargetGeneration } from '../components/canvas/frame-source.js'
import { discoverMatrixAxes, discoverMatrixProps, getMatrixState } from '../util/matrix.js'

/** Detached finite metadata belongs to one executable target generation. */
interface MatrixRuntimeProjection {
  /** Exact ordinary variant; never a local Cartesian cell. */
  target: HistoireTarget
  /** Source lifetime plus executable story revision. */
  generation: string
  /** Complete proven finite domains. */
  axes: MatrixAxis[]
  /** Detached named base defaults, excluding internal state. */
  base: Record<string, unknown>
  /** Editor types and preset values from the same guarded projection. */
  props: MatrixProp[]
  /** Fresh canonical state wins over passive observations. */
  canonical: boolean
}

/** Observe existing previews without owning sessions or executing extra stories. */
export function createMatrixRuntime(onCapture: () => void) {
  const projections = new Map<string, MatrixRuntimeProjection>()
  const seenStates = new WeakMap<object, string>()
  let current: HistoireReadonly<HistoireSnapshot> | undefined
  let closed = false

  /** Only exact current runtime state may advertise component metadata. */
  function capture(snapshot: HistoireReadonly<HistoireSnapshot>, canonical: boolean): boolean {
    const state = snapshot.state
    if (closed || !current || !state || snapshot.runtime.status !== 'ready' || !snapshot.runtime.runtimeId
      || state.runtimeId !== snapshot.runtime.runtimeId || state.target.storyId !== snapshot.selection?.storyId
      || state.target.variantId !== snapshot.selection?.variantId || state.target.storyId !== current.selection?.storyId) {
      return false
    }
    const generation = getCanvasTargetGeneration(snapshot, state.target)
    if (!generation || generation !== getCanvasTargetGeneration(current, state.target)) return false
    const previousGeneration = seenStates.get(state)
    // A retained mirror cannot become fresh merely because its catalog epoch changed.
    if (previousGeneration && previousGeneration !== generation) return false
    seenStates.set(state, generation)
    const key = getHistoireTargetKey(state.target)
    const previous = projections.get(key)
    if (!canonical && previous?.canonical) return false
    if (previousGeneration === generation && previous?.canonical === canonical) return false
    const value = getMatrixState(state.value)
    const props = structuredClone(discoverMatrixProps(value))
    projections.set(key, {
      target: { ...state.target },
      generation,
      canonical,
      axes: discoverMatrixAxes(value._hPropDefs, undefined, value),
      base: Object.fromEntries(props.map(prop => [prop.name, prop.value])),
      props,
    })
    return true
  }

  /** Invalidate first, then accept canonical publication for current generation. */
  function synchronize(snapshot: HistoireReadonly<HistoireSnapshot>): void {
    if (closed) return
    current = snapshot
    for (const [key, entry] of projections) {
      if (entry.target.storyId !== snapshot.selection?.storyId || getCanvasTargetGeneration(snapshot, entry.target) !== entry.generation) projections.delete(key)
    }
    capture(snapshot, true)
  }

  /** Chooser deterministically uses first collected variant, independent of reply order. */
  function getProjection(): MatrixRuntimeProjection | undefined {
    if (!current || closed) return
    const story = current.catalog.stories.find(story => story.id === current?.selection?.storyId)
    const variantId = current.selection?.variantId ?? story?.variants[0]?.id
    if (!story || !variantId) return
    return projections.get(getHistoireTargetKey({ storyId: story.id, variantId }))
  }

  /** Closing callback ownership retains only valid detached generation-scoped metadata. */
  function registerRuntimeObserver() {
    let active = !closed
    return {
      /** Accept real ready state already published by an ordinary passive session. */
      capture(snapshot: HistoireReadonly<HistoireSnapshot>): void {
        if (active && capture(snapshot, false)) onCapture()
      },
      /** Retire before retry/replacement/unmount can publish late snapshots. */
      close(): void { active = false },
    }
  }

  return {
    synchronize,
    getProjection,
    registerRuntimeObserver,
    /** Teardown drops all observations; caller retains canonical session ownership. */
    close(): void {
      closed = true
      current = undefined
      projections.clear()
    },
  }
}
