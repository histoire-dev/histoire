import type { HistoireSession } from '@histoire/sdk'
import type { CanvasFrames } from '../../composables/canvas-settings.js'
import type { CanvasArrangement, CanvasZoom } from '../../stores/canvas.js'
import { getHistoireTargetKey } from '@histoire/protocol'
import { watch, watchEffect } from 'vue'
import { getCanvasTargetGeneration } from './frame-source.js'

/** Story-only navigation needs a canonical variant before List can follow selection. */
interface CanvasListDefaultSelectionOptions {
  /** Current canonical source and selection; never cached collection-error content. */
  snapshot: () => ReturnType<HistoireSession['getSnapshot']>
  /** Actual arrangement after Matrix availability fallback. */
  arrangement: () => CanvasArrangement
  /** Explicit Fit and numeric choices preserve the story-only chooser. */
  zoom: () => CanvasZoom
  /** Collection failures cannot acquire a new runtime or route. */
  unavailable: () => boolean
  /** Existing canonical selection action owns route updates and error reporting. */
  select: (variantId: string) => Promise<void>
}

/** Seed only an empty List selection; geometry measurement still owns all camera fitting. */
export function watchCanvasListDefaultSelection(options: CanvasListDefaultSelectionOptions): () => void {
  return watch(() => [options.snapshot().selection, options.snapshot().catalog.stories, options.snapshot().status, options.snapshot().stale, options.arrangement(), options.zoom(), options.unavailable()], () => {
    const snapshot = options.snapshot()
    const target = snapshot.selection
    if (snapshot.status !== 'ready' || snapshot.stale || options.unavailable()
      || options.arrangement() !== 'list' || options.zoom() !== 'selection' || target?.variantId !== null) {
      return
    }
    const story = snapshot.catalog.stories.find(story => story.id === target.storyId)
    const first = story?.variants[0]
    if (first && !story?.docsOnly) void options.select(first.id)
  }, { immediate: true, flush: 'post' })
}

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
