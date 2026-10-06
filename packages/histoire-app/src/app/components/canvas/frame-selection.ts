import type { HistoireSession } from '@histoire/sdk'
import type { CanvasFrames } from '../../composables/canvas-settings.js'
import { getHistoireTargetKey } from '@histoire/protocol'
import { watchEffect } from 'vue'
import { getCanvasTargetGeneration } from './frame-source.js'

/** Selection observes frame ownership; it never controls preview lifetime. */
export interface CanvasSelectedSessionOptions {
  /** Canonical route/source snapshot, reactive in nearest provider. */
  snapshot: () => ReturnType<HistoireSession['getSnapshot']>
  /** Exact frame registrations, including loading/budget placeholders. */
  registry: CanvasFrames
  /** Matrix and collection failures use canonical inspector instead. */
  unavailable: () => boolean
  /** Publish selected ready runtime to workbench inspector. */
  publish: (session: HistoireSession | undefined) => void
}

/** Follow canonical selection from every navigation path without promoting or moving documents. */
export function watchCanvasSelectedSession(options: CanvasSelectedSessionOptions): () => void {
  let published: HistoireSession | undefined
  /** Avoid remounting inspector descendants when same owner publishes state changes. */
  function publish(owner?: HistoireSession): void {
    if (owner === published) return
    published = owner
    options.publish(owner)
  }
  const stop = watchEffect((onCleanup) => {
    const canonical = options.snapshot()
    const target = canonical.selection
    const frame = target?.variantId ? options.registry.getFrame(getHistoireTargetKey(target)) : null
    const owner = frame?.session
    const documentId = frame?.documentId
    const iframe = frame?.iframe
    if (options.unavailable() || !owner || !target || !documentId || !iframe || canonical.stale) {
      publish()
      return
    }
    /** Reject stale and replaced owners even when they publish after route navigation. */
    function synchronize(snapshot: ReturnType<HistoireSession['getSnapshot']>): void {
      const generation = getCanvasTargetGeneration(snapshot, target!)
      const valid = frame?.session === owner && frame.documentId === documentId && frame.iframe === iframe
        && snapshot.runtime.status === 'ready' && snapshot.runtime.runtimeId === documentId
        && snapshot.selection?.storyId === target!.storyId && snapshot.selection.variantId === target!.variantId
        && generation && generation === getCanvasTargetGeneration(canonical, target!)
      publish(valid ? owner : undefined)
    }
    onCleanup(owner.subscribe(synchronize))
    synchronize(owner.getSnapshot())
  }, { flush: 'sync' })
  return () => {
    stop()
    publish()
  }
}
