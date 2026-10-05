import type { HistoireControlsOverlay, HistoireControlsOverlayResult } from '@histoire/protocol'

export type { HistoireControlsAppearance, HistoireControlsAppearanceMessage, HistoireControlsOverlay, HistoireControlsOverlayItem, HistoireControlsOverlayMessage, HistoireControlsOverlayRefreshMessage, HistoireControlsOverlayResult, HistoireControlsOverlayResultMessage, HistoireControlsRect } from '@histoire/protocol'
export { CONTROLS_APPEARANCE, CONTROLS_FOCUS, CONTROLS_OVERLAY, CONTROLS_OVERLAY_REFRESH, CONTROLS_OVERLAY_RESULT } from '@histoire/protocol'

/** An overlay's lifecycle, owned by its originating controls component. */
export interface HistoireControlsOverlayHandle {
  /** Unique ID, also used by the host for DOM identity. */
  id: string
  /** Updates content and anchor geometry without replacing callbacks. */
  update: (overlay: HistoireControlsOverlay) => void
  /** Removes the overlay without restoring focus. */
  close: () => void
}

/** Adapter available inside custom controls sandboxes. */
export interface HistoireControlsHost {
  /** Continue Tab beside owning outer frame; never accepts a DOM selector. */
  requestFocus?: (direction: 'next' | 'previous') => void
  /** Opens an overlay in the host while retaining local values and callbacks. */
  open: (anchor: HTMLElement, overlay: HistoireControlsOverlay, onResult: (result: HistoireControlsOverlayResult) => void) => HistoireControlsOverlayHandle
}

declare global {
  interface Window {
    /** Controls-only host adapter installed before story modules mount. */
    __HST_CONTROLS_HOST__?: HistoireControlsHost
  }
}
