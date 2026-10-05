import type { CanvasFrameLayout } from './frame-layout.js'
import { watch } from 'vue'

/** Focus responds to selected identity and arrangement, independently of transform geometry. */
export interface CanvasFrameFocusOptions {
  /** Current selected frame; zoom can regenerate its layout object. */
  getFrame: () => CanvasFrameLayout | undefined
  /** Arrangement changes may reveal the previously hidden canonical primary. */
  getArrange: () => 'grid' | 'list' | 'matrix'
  /** Bring selected frame into view without changing selected variant. */
  focusFrame: (frame: CanvasFrameLayout) => void
  /** Refresh physical primary document registration after identity changes. */
  registerPrimary: () => void
}

/** Bind focus to canonical selection while matrix retains its own passive-cell selection. */
export function watchCanvasFrameFocus(options: CanvasFrameFocusOptions) {
  // Scalar sources keep zoom-created frame objects from retriggering selection focus.
  return watch([() => options.getFrame()?.id, options.getArrange], () => {
    const frame = options.getFrame()
    if (frame && options.getArrange() !== 'matrix') options.focusFrame(frame)
    options.registerPrimary()
  }, { flush: 'post' })
}
