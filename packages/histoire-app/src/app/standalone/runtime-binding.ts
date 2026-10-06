import type { HistoireSession } from '@histoire/sdk'
import { shallowReadonly, shallowRef } from 'vue'
import { getCanvasTargetGeneration } from '../components/canvas/frame-source.js'

/** Route stays canonical; runtime consumers follow one already admitted exact document. */
export function createStandaloneRuntimeBinding(canonical: HistoireSession) {
  const current = shallowRef(canonical)
  const snapshot = shallowRef(canonical.getSnapshot())
  let stopOwner = () => {}
  let closed = false

  /** Delayed frame readiness cannot acquire a different route or source generation. */
  function matches(owner: ReturnType<HistoireSession['getSnapshot']>): boolean {
    const root = canonical.getSnapshot()
    const target = root.selection
    return !!target?.variantId && owner.runtime.status === 'ready'
      && owner.selection?.storyId === target.storyId && owner.selection.variantId === target.variantId
      && !!getCanvasTargetGeneration(root, target)
      && getCanvasTargetGeneration(owner, target) === getCanvasTargetGeneration(root, target)
  }

  /** Binding never mounts, moves, retargets, or disposes a frame session. */
  function bind(owner?: HistoireSession): void {
    if (closed) return
    const next = owner && matches(owner.getSnapshot()) ? owner : canonical
    if (next === current.value) return
    stopOwner()
    snapshot.value = next.getSnapshot()
    current.value = next
    stopOwner = next === canonical
      ? () => {}
      : next.subscribe((value) => {
          if (!matches(value)) bind()
          else snapshot.value = value
        })
  }
  const stopCanonical = canonical.subscribe((value) => {
    if (current.value === canonical) snapshot.value = value
    else if (!matches(current.value.getSnapshot())) bind()
  })
  return {
    /** Exact source or admitted runtime owner; consumers retire operations on changes. */
    current: shallowReadonly(current),
    /** Current document state remains reactive for command visibility and parameters. */
    snapshot: shallowReadonly(snapshot),
    bind,
    /** Bootstrap owns subscriptions, while canvas remains sole owner of frame lifetime. */
    close(): void {
      closed = true
      stopOwner()
      stopCanonical()
    },
  }
}

/** Standalone bootstrap and workbench share this explicit runtime binding. */
export type StandaloneRuntimeBinding = ReturnType<typeof createStandaloneRuntimeBinding>
