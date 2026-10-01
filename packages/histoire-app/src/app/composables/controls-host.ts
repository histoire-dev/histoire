import type { HistoireControlsOverlayMessage, HistoireInboundPreviewMessage } from '@histoire/shared'
import type { Ref } from 'vue'
import type { Story, Variant } from '../types'
import { CONTROLS_APPEARANCE, CONTROLS_OVERLAY, CONTROLS_OVERLAY_REFRESH, CONTROLS_OVERLAY_RESULT } from '@histoire/shared'
import { useEventListener, useResizeObserver } from '@vueuse/core'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { histoireConfig } from '../util/config'
import { getControlsOverlayAnchor } from '../util/controls-overlay-anchor'
import { isDark } from '../util/dark'

/** Owns appearance and overlays for one controls sandbox; state sync stays separate. */
export function useControlsHost(iframe: Ref<HTMLIFrameElement | null>, props: { story: Story, variant: Variant }) {
  const request = ref<HistoireControlsOverlayMessage | null>(null)
  const frameBounds = ref({ x: 0, y: 0, width: 0, height: 0 })
  const visibleBounds = ref([{ x: 0, y: 0, width: 0, height: 0 }])
  const overlay = computed(() => {
    const value = request.value
    if (!value?.overlay) return null
    const anchor = getControlsOverlayAnchor(value.anchor, frameBounds.value, visibleBounds.value)
    return anchor ? { ...value, anchor } : null
  })

  /** Posts only to this same-origin controls frame, with the protocol marker. */
  function post(payload: Record<string, unknown>) {
    iframe.value?.contentWindow?.postMessage({ __histoire: true, storyId: props.story.id, variantId: props.variant.id, ...payload }, window.location.origin)
  }

  /** Copies panel typography and configured theme tokens after host classes update. */
  async function syncAppearance() {
    await nextTick()
    const element = iframe.value?.parentElement
    if (!element) return
    const style = getComputedStyle(element)
    // Transparent iframe canvases become black under color-scheme: dark.
    // Resolve the panel's painted surface instead of relying on transparency.
    let background = 'transparent'
    for (let surface: HTMLElement | null = element; surface; surface = surface.parentElement) {
      const color = getComputedStyle(surface).backgroundColor
      if (color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)') {
        background = color
        break
      }
    }
    const properties: Record<string, string> = {
      '--histoire-controls-background': background,
      '--histoire-controls-foreground': style.color,
      '--histoire-controls-font-family': style.fontFamily,
      '--histoire-controls-font-size': style.fontSize,
      '--histoire-controls-line-height': style.lineHeight,
    }
    for (const [color, shades] of Object.entries(histoireConfig.theme.colors)) {
      for (const shade of Object.keys(shades)) {
        const name = `--_histoire-color-${color}-${shade}`
        properties[name] = style.getPropertyValue(name)
      }
    }
    post({ type: CONTROLS_APPEARANCE, appearance: { dark: isDark.value, properties } })
  }

  /** Resolves an overlay and optionally returns keyboard focus to its real anchor. */
  function closeOverlay(itemId?: string, restoreFocus = false, focusDirection?: 'next' | 'previous') {
    const current = request.value
    request.value = null
    if (current) post({ type: CONTROLS_OVERLAY_RESULT, id: current.id, itemId, restoreFocus, focusDirection })
  }

  /** Ignores delayed hide events belonging to an overlay that was already replaced. */
  function resolveOverlay(id: string, itemId?: string, restoreFocus = false, focusDirection?: 'next' | 'previous') {
    if (request.value?.id === id) closeOverlay(itemId, restoreFocus, focusDirection)
  }

  /** Measures host frame and scroll bounds without generating a message echo. */
  function measure() {
    const frame = iframe.value
    if (!frame || !request.value) return
    frameBounds.value = frame.getBoundingClientRect()
    const panel = frame.closest('.histoire-story-controls')
    visibleBounds.value = [
      { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight },
      ...(panel ? [panel.getBoundingClientRect()] : []),
    ]
    if (!overlay.value) closeOverlay()
  }

  /** Tracks host scroll/resize and requests current sandbox anchor geometry. */
  function refresh() {
    measure()
    if (request.value) post({ type: CONTROLS_OVERLAY_REFRESH, id: request.value.id })
  }

  /** Handles overlay messages after the iframe's shared trust and scope checks. */
  function handleMessage(message: HistoireInboundPreviewMessage) {
    if (message.type !== CONTROLS_OVERLAY || message.storyId !== props.story.id || message.variantId !== props.variant.id) return false
    if (message.overlay === null) {
      if (request.value?.id === message.id) request.value = null
      return true
    }
    if (!message.anchor || !message.overlay || !['select', 'tooltip'].includes(message.overlay.kind)) return true
    if (request.value && request.value.id !== message.id) closeOverlay()
    request.value = message as HistoireControlsOverlayMessage
    // An overlay update is also a geometry refresh; don't echo another request.
    measure()
    return true
  }

  useEventListener(document, 'scroll', refresh, { capture: true, passive: true })
  useEventListener(window, 'resize', () => {
    refresh()
    void syncAppearance()
  })
  useEventListener(window, 'keydown', (event) => {
    if (event.key === 'Escape' && request.value) {
      event.preventDefault()
      closeOverlay(undefined, true)
    }
  })
  useResizeObserver(iframe, refresh)
  watch(isDark, syncAppearance)
  watch(iframe, () => closeOverlay())
  onBeforeUnmount(() => closeOverlay())

  return { overlay, closeOverlay, resolveOverlay, handleMessage, syncAppearance }
}
