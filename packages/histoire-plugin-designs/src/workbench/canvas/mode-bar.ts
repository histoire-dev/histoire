import type { OverlayState } from './overlay-state.js'
import { createApp, h } from 'vue'
import { element } from './design-element.js'
import DesignModeBar from './DesignModeBar.vue'

/** Floating comparison bar at the bottom of the canvas view. */
export interface ModeBar {
  /** Bar element, placed once in the view root outside the pan and zoom layer. */
  node: HTMLElement
  /** Unmounts the bar's Vue app. */
  dispose: () => void
}

/**
 * Mounts the comparison bar in its own Vue app: the canvas view itself is a DOM view.
 * @param overlay Comparison mode and opacity.
 * @param onReset Restores the default placement of the shown design.
 */
export function createModeBar(overlay: OverlayState, onReset: () => void): ModeBar {
  const node = element('div', 'histoire-designs-canvas-bar')
  const app = createApp({ render: () => h(DesignModeBar, { overlay, onReset }) })
  app.mount(node)
  return { node, dispose: () => app.unmount() }
}
