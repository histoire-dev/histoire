import type { CanvasFrameLayout } from './frame-layout.js'
import { watch } from 'vue'

/** Focus responds to selected identity and arrangement, independently of transform geometry. */
export interface CanvasFrameFocusOptions {
  /** Current selected frame; zoom can regenerate its layout object. */
  getFrame: () => CanvasFrameLayout | undefined
  /** Arrangement changes may reveal selected frame in another layout. */
  getArrange: () => 'grid' | 'list' | 'matrix'
  /** Bring selected frame into view without changing selected variant. */
  focusFrame: (frame: CanvasFrameLayout) => void
  /** Update selected frame without moving the canvas. */
  selectFrame: (frame: CanvasFrameLayout) => void
  /** Allow input-originated selection to retain the user's current viewport. */
  shouldRevealFrame?: (frame: CanvasFrameLayout) => boolean
}

/** Bind focus to canonical selection while matrix retains its own passive-cell selection. */
export function watchCanvasFrameFocus(options: CanvasFrameFocusOptions) {
  // Scalar sources keep zoom-created frame objects from retriggering selection focus.
  return watch([() => options.getFrame()?.id, options.getArrange], ([, arrange]) => {
    const frame = options.getFrame()
    if (frame && arrange !== 'matrix') {
      if (options.shouldRevealFrame?.(frame) === false) options.selectFrame(frame)
      else options.focusFrame(frame)
    }
  }, { flush: 'post' })
}
