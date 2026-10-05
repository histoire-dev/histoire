import type { CanvasFrameLayout } from './frame-layout.js'
import type { CanvasRect } from './pan/usePanZoom.js'
import { useTimeoutFn } from '@vueuse/core'
import { readonly, shallowRef, watch } from 'vue'
import { liveCanvasFrames } from './frame-layout.js'

/** Inputs shared by normal variant canvases and props matrices. */
export interface CanvasFrameAdmissionOptions {
  /** Current logical frame geometry, independent of mounted previews. */
  frames: () => readonly CanvasFrameLayout[]
  /** Visible logical viewport after pan, zoom, and fixed chrome reserves. */
  viewport: () => CanvasRect
  /** Available live slots; zero reserves every slot for the canonical preview. */
  budget: () => number
  /** Explicit selection always bypasses movement deferral. */
  selected: () => string | null
  /** Pointer remains held, even if it temporarily stops moving. */
  moving: () => boolean
  /** Stable structural key; unrelated catalog snapshots must not bypass deferral. */
  context: () => unknown
}

/** Keep current previews during movement; rank the final viewport once input settles. */
export function useCanvasFrameAdmission(options: CanvasFrameAdmissionOptions) {
  const live = shallowRef(new Set<string>())
  const timer = useTimeoutFn(refresh, 150, { immediate: false })

  /** Re-read current inputs instead of admitting frames captured before navigation. */
  function refresh(): void {
    timer.stop()
    const budget = options.budget()
    live.value = budget <= 0 ? new Set<string>() : liveCanvasFrames(options.frames(), options.viewport(), budget, options.selected())
  }

  watch([options.frames, options.viewport], () => {
    // Geometry still redraws immediately; runtime mounting waits for quiet wheel/zoom input.
    if (!options.moving()) timer.start()
  }, { flush: 'sync' })
  watch(options.moving, moving => moving ? timer.stop() : refresh(), { flush: 'sync' })
  watch([options.selected, options.budget, options.context], refresh, { immediate: true, flush: 'sync' })
  return readonly(live)
}
