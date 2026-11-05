import type { WorkbenchPluginApi } from '@histoire/plugin-kit'
import type { HistoireTarget } from '@histoire/protocol'
import type { CanvasMode, OverlayPlacement } from './overlay-geometry.js'
import { parseMode, parsePlacement } from './overlay-geometry.js'

/** Plugin API members the overlay state uses. */
export type OverlayStateApi = Pick<WorkbenchPluginApi, 'preferences'>

/** Canvas comparison settings shared by the canvas view and its comparison bar. */
export interface OverlayState {
  /** Current comparison mode. */
  mode: () => CanvasMode
  /** Switches the comparison mode. */
  setMode: (mode: CanvasMode) => void
  /** Design opacity in Overlay mode, between 0.1 and 1. */
  opacity: () => number
  /** Sets the design opacity; clamped like {@link OverlayState.opacity}. */
  setOpacity: (value: number) => void
  /** Moved or resized design box of one variant design; `undefined` keeps the default box. */
  placement: (target: HistoireTarget, entryIndex: number) => OverlayPlacement | undefined
  /** Stores the design box of one variant design. */
  setPlacement: (target: HistoireTarget, entryIndex: number, placement: OverlayPlacement) => void
  /** Restores the default design box of one variant design. */
  reset: (target: HistoireTarget, entryIndex: number) => void
  /** Notified after any setter. */
  subscribe: (listener: () => void) => () => void
}

/** Opacity used before the user picks one. */
const DEFAULT_OPACITY = 0.5
/** Lowest opacity, so the design never disappears entirely. */
const MIN_OPACITY = 0.1

/**
 * Clamps an opacity to the visible range.
 * @param value Opacity.
 */
function clampOpacity(value: number): number {
  return Math.min(1, Math.max(MIN_OPACITY, value))
}

/**
 * Creates the preferences-backed overlay state. Mode and opacity are global; placements are
 * per variant design entry.
 * @param api Plugin API.
 */
export function createOverlayState(api: OverlayStateApi): OverlayState {
  const listeners = new Set<() => void>()

  /**
   * Preference key of one variant design placement.
   * @param target Variant.
   * @param entryIndex Design entry index.
   */
  const placementKey = (target: HistoireTarget, entryIndex: number) => `overlay:${target.storyId}:${target.variantId}:${entryIndex}`

  /** Updates the view and its comparison bar. */
  function notify(): void {
    for (const listener of [...listeners]) listener()
  }

  return {
    mode: () => parseMode(api.preferences.get('canvas-mode', null)),
    setMode(mode) {
      api.preferences.set('canvas-mode', mode)
      notify()
    },
    opacity() {
      const stored = api.preferences.get('overlay-opacity', DEFAULT_OPACITY)
      return typeof stored === 'number' && Number.isFinite(stored) ? clampOpacity(stored) : DEFAULT_OPACITY
    },
    setOpacity(value) {
      api.preferences.set('overlay-opacity', clampOpacity(value))
      notify()
    },
    placement: (target, entryIndex) => parsePlacement(api.preferences.get(placementKey(target, entryIndex), null)),
    setPlacement(target, entryIndex, placement) {
      api.preferences.set(placementKey(target, entryIndex), { ...placement })
      notify()
    },
    reset(target, entryIndex) {
      api.preferences.set(placementKey(target, entryIndex), null)
      notify()
    },
    subscribe(listener) {
      const entry = (): void => listener()
      listeners.add(entry)
      return () => void listeners.delete(entry)
    },
  }
}
