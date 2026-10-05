import { useHistoireContext } from '@histoire/vue/internal'
import { computed } from 'vue'
import { useCanvasStore } from '../../../composables/canvas-settings.js'
import { useOverflowToolbar } from '../../base/overflow/context.js'
import { reservePopoverInlineEnd } from '../../base/popover/position.js'

/** Supply provider-local geometry to generic popovers without coupling base UI to canvas. */
export function useCanvasPopoverBounds(anchor: () => HTMLElement | null | undefined) {
  const context = useHistoireContext()
  const canvas = useCanvasStore()
  const { toolbar } = useOverflowToolbar()
  /** Read current DOM coordinates on every placement, including host scrolling. */
  function bounds() {
    // A teleported child trigger no longer has canvas among its DOM ancestors.
    // Keep geometry owned by its logical toolbar instead of the portal target.
    const inherited = toolbar?.bounds()
    if (inherited) return inherited
    // These dependencies refresh placement during pane/inspector resizing.
    void canvas.viewport.width
    void canvas.viewport.height
    void context.size.value
    const element = anchor()
    const viewport = element?.closest('.histoire-canvas-viewport')
    const rect = (viewport ?? context.root.value)?.getBoundingClientRect()
    const view = element?.ownerDocument.defaultView ?? context.root.value?.ownerDocument.defaultView
    const surface = { left: rect?.left ?? 0, top: rect?.top ?? 0, right: rect?.right ?? view?.innerWidth ?? 0, bottom: rect?.bottom ?? view?.innerHeight ?? 0 }
    return reservePopoverInlineEnd(surface, viewport ? canvas.inspectorWidth : 0, viewport && view ? view.getComputedStyle(viewport).direction : 'ltr')
  }
  return { bounds, overlayTarget: computed(() => context.overlay.value ?? context.root.value) }
}
