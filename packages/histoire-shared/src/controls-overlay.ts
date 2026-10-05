import type { HistoireControlsHost, HistoireControlsOverlay, HistoireControlsOverlayResult } from './types/controls.js'
import { CONTROLS_FOCUS, CONTROLS_OVERLAY, CONTROLS_OVERLAY_REFRESH, CONTROLS_OVERLAY_RESULT } from './types/controls.js'

/** Monotonic overlay identity within this document's module instance. */
let nextOverlayId = 0

/** Returns the host adapter inside a controls sandbox, otherwise undefined. */
export function getControlsHost(): HistoireControlsHost | undefined {
  return typeof window === 'undefined' ? undefined : window.__HST_CONTROLS_HOST__
}

/** Dependencies of the framework-independent controls overlay transport. */
interface ControlsOverlayBridgeOptions {
  /** Optional strict document identity for SDK wrappers; legacy hosts omit it. */
  documentId?: string
  /** Window running story code. */
  window: Window
  /** Embedding Histoire window, resolved through frameElement. */
  host: Window
  /** Story owning this controls document. */
  storyId: string
  /** Variant owning this controls document. */
  variantId: string
  /** Existing origin-pinned, marker-bearing outbound transport. */
  post: (payload: Record<string, unknown>) => void
}

/**
 * Creates a local callback registry for host overlays. Only labels, IDs and
 * geometry cross postMessage; option values and closures never leave the story.
 */
export function createControlsOverlayBridge(options: ControlsOverlayBridgeOptions): HistoireControlsHost & { dispose: () => void } {
  const pending = new Map<string, {
    anchor: HTMLElement
    overlay: HistoireControlsOverlay
    onResult: (result: HistoireControlsOverlayResult) => void
  }>()
  const scope = { storyId: options.storyId, variantId: options.variantId }

  /** Publishes the latest anchor bounds, including movements within the frame. */
  function publish(id: string) {
    const entry = pending.get(id)
    if (!entry) return
    const { x, y, width, height } = entry.anchor.getBoundingClientRect()
    options.post({ type: CONTROLS_OVERLAY, ...scope, id, anchor: { x, y, width, height }, overlay: entry.overlay })
  }

  /** Removes one registry entry and its host overlay. */
  function close(id: string) {
    if (pending.delete(id)) {
      options.post({ type: CONTROLS_OVERLAY, ...scope, id, overlay: null })
    }
  }

  /** Only the current embedding host may refresh geometry or resolve callbacks. */
  function onMessage(event: MessageEvent) {
    const message = event.data
    if (event.source !== options.host || event.origin !== options.window.location.origin
      || !message?.__histoire || message.storyId !== scope.storyId || message.variantId !== scope.variantId) {
      return
    }
    if (options.documentId && message.documentId !== options.documentId) return
    const entry = pending.get(message.id)
    if (!entry) return
    if (message.type === CONTROLS_OVERLAY_REFRESH) {
      publish(message.id)
    }
    else if (message.type === CONTROLS_OVERLAY_RESULT) {
      if (message.itemId !== undefined && (entry.overlay.kind !== 'select'
        || !entry.overlay.items.some(item => item.id === message.itemId && !item.disabled))) {
        return
      }
      pending.delete(message.id)
      entry.onResult({
        itemId: message.itemId,
        restoreFocus: message.restoreFocus === true,
        ...(['next', 'previous'].includes(message.focusDirection) ? { focusDirection: message.focusDirection } : {}),
      })
    }
  }

  /** Dismisses a host overlay when another control inside the sandbox is clicked. */
  function onPointerDown(event: PointerEvent) {
    for (const [id, entry] of pending) {
      if (entry.anchor.contains(event.target as Node)) continue
      close(id)
      entry.onResult({ restoreFocus: false })
    }
  }

  /** Refreshes anchors when scrolling occurs inside the controls document. */
  function onScroll() {
    for (const id of pending.keys()) publish(id)
  }

  /** Supports Escape while keyboard focus remains in the sandbox. */
  function onKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return
    for (const [id, entry] of pending) {
      close(id)
      entry.onResult({ restoreFocus: entry.overlay.kind === 'select' })
    }
  }

  options.window.addEventListener('message', onMessage)
  options.window.addEventListener('pointerdown', onPointerDown, true)
  options.window.addEventListener('scroll', onScroll, true)
  options.window.addEventListener('keydown', onKeydown)
  return {
    requestFocus: direction => options.post({ type: CONTROLS_FOCUS, ...scope, direction }),
    /** Opens a local session and sends only its serializable presentation. */
    open(anchor, overlay, onResult) {
      // A document timestamp distinguishes reloads without requiring HTTPS-only
      // crypto.randomUUID on plain HTTP development servers.
      const id = `histoire-control-${options.window.performance.timeOrigin}-${++nextOverlayId}`
      pending.set(id, { anchor, overlay, onResult })
      publish(id)
      return {
        id,
        /** Reuses the session callback while refreshing content and geometry. */
        update(overlay) {
          const entry = pending.get(id)
          if (!entry) return
          entry.overlay = overlay
          publish(id)
        },
        close: () => close(id),
      }
    },
    /** Removes every outstanding overlay and detaches document listeners. */
    dispose() {
      for (const id of pending.keys()) close(id)
      options.window.removeEventListener('message', onMessage)
      options.window.removeEventListener('pointerdown', onPointerDown, true)
      options.window.removeEventListener('scroll', onScroll, true)
      options.window.removeEventListener('keydown', onKeydown)
    },
  }
}
