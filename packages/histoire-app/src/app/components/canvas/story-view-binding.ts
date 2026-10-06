import type { CanvasArrangement, CanvasStore } from '../../stores/canvas.js'
import type { StoryCanvasViews } from '../../stores/story-canvas-views.js'
import type { CanvasFrameLayout } from './frame-layout.js'
import { watch } from 'vue'

/** Reactive owners needed to bind one canvas instance to workbench view memory. */
export interface StoryCanvasViewBindingOptions {
  /** Current catalog story identifier. */
  getStoryId: () => string | undefined
  /** Arrangement selected by route or current story preference. */
  getArrangement: () => CanvasArrangement
  /** Arrangement after temporary Matrix availability fallback. */
  getRenderedArrangement: () => CanvasArrangement
  /** Story/config arrangement used when route has explicit override. */
  getBaseArrangement: () => CanvasArrangement
  /** Whether route contains a recognized explicit arrangement. */
  hasArrangementOverride: () => boolean
  /** Whether one transform is shared across stories. */
  getSyncZoom: () => boolean
  /** Canvas geometry and camera owner. */
  canvas: CanvasStore
  /** Workbench-lifetime story view owner. */
  views: StoryCanvasViews
}

/** Bind camera snapshots to story changes, sync mode, and canvas mutations. */
export function bindStoryCanvasView(options: StoryCanvasViewBindingOptions) {
  const { canvas, views } = options
  let activeStoryId = options.getStoryId()
  let activeArrangement = options.getArrangement()
  let restoredStoryId: string | undefined
  let restoredInitialFocusStoryId: string | undefined
  let restoring = false

  /** Route arrangement overrides rendering while retaining the saved base arrangement. */
  function snapshotArrangement(storyId: string, shared: boolean): CanvasArrangement {
    if (!options.hasArrangementOverride()) return activeArrangement
    const saved = shared ? views.getShared() : views.getStory(storyId)
    return saved?.arrangement ?? options.getBaseArrangement()
  }

  /** Capture one detached snapshot using arrangement requested by the user. */
  function capture(storyId: string, shared = options.getSyncZoom()) {
    return canvas.snapshotView(snapshotArrangement(storyId, shared))
  }

  /** Save current transform to the active owner. */
  function saveActive(storyId: string, shared = options.getSyncZoom()): void {
    const snapshot = capture(storyId, shared)
    if (shared) views.saveShared(snapshot)
    else views.saveStory(storyId, snapshot)
  }

  /** Restore a view and prevent route selection from moving its camera. */
  function restore(storyId: string, snapshot: ReturnType<typeof canvas.snapshotView>): void {
    restoring = true
    try {
      canvas.restoreView(snapshot)
      activeArrangement = options.hasArrangementOverride() ? options.getArrangement() : snapshot.arrangement
      canvas.setArrangement(options.getRenderedArrangement())
    }
    finally {
      restoring = false
    }
    restoredStoryId = storyId
    restoredInitialFocusStoryId = storyId
  }

  /** Choose normal arrangement fallback when a story has no saved view. */
  function fallbackArrangement(): CanvasArrangement {
    return options.hasArrangementOverride() ? options.getArrangement() : options.getBaseArrangement()
  }

  const stopStory = watch(options.getStoryId, (storyId, previousStoryId) => {
    if (previousStoryId && !options.getSyncZoom()) saveActive(previousStoryId, false)
    activeStoryId = storyId
    if (!storyId) return

    if (options.getSyncZoom()) {
      const shared = views.getShared()
      if (shared) {
        restore(storyId, shared)
      }
      else {
        const storyView = views.getStory(storyId)
        if (storyView) {
          views.saveShared(storyView)
          restore(storyId, storyView)
        }
        else if (previousStoryId) {
          saveActive(previousStoryId, true)
          restoredStoryId = storyId
          restoredInitialFocusStoryId = storyId
        }
      }
      return
    }

    const storyView = views.getStory(storyId)
    if (storyView) {
      restore(storyId, storyView)
    }
    else if (previousStoryId) {
      activeArrangement = fallbackArrangement()
      canvas.setArrangement(options.getRenderedArrangement())
      canvas.fit()
    }
  }, { flush: 'pre', immediate: true })

  const stopSync = watch(options.getSyncZoom, (enabled, previous) => {
    const storyId = activeStoryId
    if (!storyId || enabled === previous) return

    if (enabled) {
      saveActive(storyId, false)
      const storyView = views.getStory(storyId)
      if (storyView) views.saveShared(storyView)
      else saveActive(storyId, true)
      return
    }

    const storyView = views.getStory(storyId)
    if (storyView) {
      restore(storyId, storyView)
    }
    else {
      activeArrangement = fallbackArrangement()
      canvas.setArrangement(options.getRenderedArrangement())
      canvas.fit()
    }
  }, { flush: 'sync' })

  const stopArrangement = watch(options.getArrangement, (arrangement) => {
    if (options.getStoryId() === activeStoryId) activeArrangement = arrangement
  }, { flush: 'sync' })

  // Keep the latest view ready before route changes or conditional unmounts.
  const stopView = watch(() => [
    canvas.zoomByArrange.grid,
    canvas.zoomByArrange.list,
    canvas.zoomByArrange.matrix,
    canvas.panOffset.x,
    canvas.panOffset.y,
    options.getArrangement(),
    options.getBaseArrangement(),
    options.hasArrangementOverride(),
    options.getSyncZoom(),
  ], () => {
    if (!restoring && activeStoryId && options.getStoryId() === activeStoryId) saveActive(activeStoryId)
  }, { flush: 'sync', immediate: true })

  return {
    /** Focus initial selection unless a restored view owns the camera. */
    focusInitialFrame(frame: CanvasFrameLayout): void {
      if (restoredInitialFocusStoryId === frame.storyId) {
        restoredInitialFocusStoryId = undefined
        canvas.selectFrame(frame)
      }
      else {
        canvas.focusFrame(frame)
      }
    },
    /** Skip one automatic reveal after switching to a saved or shared view. */
    shouldRevealFrame(frame: CanvasFrameLayout): boolean {
      if (restoredStoryId !== frame.storyId) return true
      restoredStoryId = undefined
      return false
    },
    /** Defer layout changes while destination story props are being reconciled. */
    isActiveStory(storyId: string | undefined): boolean {
      return activeStoryId === storyId
    },
    /** Capture the active view and stop reactive bindings before canvas teardown. */
    dispose(): void {
      if (activeStoryId) saveActive(activeStoryId)
      stopStory()
      stopSync()
      stopArrangement()
      stopView()
    },
  }
}
