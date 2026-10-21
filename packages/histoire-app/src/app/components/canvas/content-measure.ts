import type { CanvasSize } from './pan/usePanZoom.js'

/** Inputs captured for one ready sandbox document and exact variant actor. */
export interface CanvasContentMeasureOptions {
  /** Same-origin runtime document, never the workbench host document. */
  document: Document
  /** Exact variant root; sibling/controls mounts must not contribute. */
  variantId: string
  /** Stable manual viewport used when viewport-relative content cannot converge. */
  fallback: CanvasSize
  /** Runtime/source/selection ownership fence checked before every DOM operation. */
  isCurrent: () => boolean
  /** Publish unscaled content dimensions, without modifying canonical settings. */
  publish: (size: CanvasSize) => void
}

/** Observe intrinsic flow geometry while retaining one live story document. */
export function observeCanvasContentSize(options: CanvasContentMeasureOptions): () => void {
  const document = options.document
  const window = document.defaultView!
  const root = [...document.querySelectorAll<HTMLElement>('[data-histoire-runtime-content]')]
    .find(element => element.dataset.histoireVariantId === options.variantId)
  if (!root || !window) return () => {}
  const style = document.createElement('style')
  style.dataset.histoireContentSizing = ''
  style.textContent = `
    html, body, #app { height: auto !important; min-height: 0 !important; }
    body { overflow: hidden !important; }
    #app { width: max-content; max-width: 16384px; }
    #app [data-histoire-runtime-content], #app .__histoire-render-story:not(.__histoire-render-custom-controls) {
      display: flow-root; width: max-content; max-width: 16384px;
      height: auto; min-height: 0; overflow: visible;
    }
  `
  document.head.append(style)
  let active = true
  let scheduled = 0
  let previous: CanvasSize | undefined
  let passes = { width: 0, height: 0 }
  let frozen = { width: false, height: false }

  /** CSS pixels round outwards and share existing custom viewport limits. */
  function bounded(value: number): number {
    return Math.max(1, Math.min(16384, Math.ceil(Number.isFinite(value) ? value : 1)))
  }

  /** Measure the flow root, not document scroll extents that include overlays/old viewport. */
  function measure(): void {
    scheduled = 0
    if (!active || !options.isCurrent() || !root?.isConnected) return
    const rect = root.getBoundingClientRect()
    const size = { width: bounded(rect.width), height: bounded(rect.height) }
    for (const axis of ['width', 'height'] as const) {
      if (previous && size[axis] !== previous[axis] && ++passes[axis] > 8) frozen[axis] = true
      if (frozen[axis]) size[axis] = bounded(options.fallback[axis])
    }
    if (previous?.width === size.width && previous.height === size.height) return
    previous = size
    options.publish(size)
    // A follow-up distinguishes stable intrinsic sizing from viewport feedback.
    schedule()
  }

  /** Coalesce observer notifications, resetting feedback guards only for authored changes. */
  function schedule(external = false): void {
    if (!active || !options.isCurrent()) return
    if (external) {
      passes = { width: 0, height: 0 }
      frozen = { width: false, height: false }
    }
    if (!scheduled) scheduled = window.requestAnimationFrame(measure)
  }

  const resize = new window.ResizeObserver(() => schedule())
  resize.observe(root)
  const mutation = new window.MutationObserver(() => schedule(true))
  mutation.observe(root, { childList: true, subtree: true, characterData: true, attributes: true })
  const external = () => schedule(true)
  root.addEventListener('load', external, true)
  document.fonts?.addEventListener('loadingdone', external)
  void document.fonts?.ready.then(() => schedule(true))
  schedule(true)
  return () => {
    active = false
    window.cancelAnimationFrame(scheduled)
    resize.disconnect()
    mutation.disconnect()
    root.removeEventListener('load', external, true)
    document.fonts?.removeEventListener('loadingdone', external)
    style.remove()
  }
}
