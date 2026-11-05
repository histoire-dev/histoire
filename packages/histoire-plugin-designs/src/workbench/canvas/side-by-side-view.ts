import type { CanvasViewContext, CanvasViewInput, MountView, ViewHost } from '@histoire/plugin-kit'
import type { HistoireRect, HistoireTarget } from '@histoire/protocol'
import type { DesignModel } from '../model.js'
import type { BoxSize } from './design-element.js'
import type { OverlayPlacement } from './overlay-geometry.js'
import type { OverlayState } from './overlay-state.js'
import { createDesignElement, element, scaleEmbed } from './design-element.js'
import { createDesignLabel } from './design-label.js'
import { createModeBar } from './mode-bar.js'
import { createOverlayChrome } from './overlay-chrome.js'
import { defaultPlacement, overlayBounds } from './overlay-geometry.js'
import { imageError, isReleased, viewState } from './view-state.js'

/** Variant frame size in canvas units; fixed, so the leased frame box never goes stale. */
const FRAME: BoxSize = { width: 420, height: 720 }
/** Height of the column labels (variant title, design name or switch) in canvas units. */
const LABEL_HEIGHT = 32
/** Horizontal space between the variant column and the design column in canvas units. */
const GAP = 48
/** Leased frame box in canvas space; overlays start on it. */
const FRAME_BOX: HistoireRect = { x: 0, y: LABEL_HEIGHT, ...FRAME }
/** Variant column box (label included) in canvas space. */
const FRAME_COLUMN: HistoireRect = { x: 0, y: 0, width: FRAME.width, height: LABEL_HEIGHT + FRAME.height }

/**
 * Canvas-space box (label included) of the design column beside the variant.
 * @param design Design box size.
 */
function sideColumn(design: BoxSize): HistoireRect {
  return { x: FRAME.width + GAP, y: 0, width: design.width, height: LABEL_HEIGHT + design.height }
}

/**
 * Applies a canvas-space box to an absolutely placed element.
 * @param node Element.
 * @param rect Box in canvas units.
 */
function placeBox(node: HTMLElement, rect: HistoireRect): void {
  Object.assign(node.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` })
}

/**
 * Renders the selected variant in a leased frame with its active design beside it, or laid
 * over it (Overlay and Split modes).
 * @param container Host-owned view container.
 * @param initial First canvas-scoped context.
 * @param host View host services.
 * @param model Design model.
 * @param overlay Comparison mode and design placements.
 * @param onLayout Receives the content boxes, read by the view's `layout` for Fit.
 */
function mountSideBySide(container: HTMLElement, initial: CanvasViewContext, host: ViewHost, model: DesignModel, overlay: OverlayState, onLayout: (rects: HistoireRect[]) => void) {
  let context = initial
  const layer = element('div', 'histoire-designs-canvas-layer')
  // Persistent element the host renders empty/loading states into.
  const state = element('div', 'histoire-designs-canvas-state')
  const root = element('div', 'histoire-designs histoire-designs-canvas')
  // The full-size background acts like empty canvas; columns stay view content.
  root.setAttribute('data-histoire-canvas-pan', '')
  root.append(layer, state)
  container.append(root)

  const frameColumn = element('div', 'histoire-designs-canvas-column')
  const frameLabel = element('div', 'histoire-designs-canvas-label')
  const frameTitle = element('span', 'histoire-designs-canvas-title')
  frameLabel.append(frameTitle)
  const frameBox = element('div', 'histoire-designs-canvas-box')
  Object.assign(frameBox.style, { width: `${FRAME.width}px`, height: `${FRAME.height}px` })
  frameColumn.append(frameLabel, frameBox)
  placeBox(frameColumn, FRAME_COLUMN)
  const designColumn = element('div', 'histoire-designs-canvas-column histoire-designs-canvas-design')
  // Switches read the selection on click: buttons outlive renders, the target may change.
  const designLabel = createDesignLabel((entryIndex) => {
    const target = context.selection.target
    if (target?.variantId) model.select(target, entryIndex)
  })
  const designBox = element('div', 'histoire-designs-canvas-box')
  designColumn.append(designLabel.node, designBox)

  let lease: AbortController | undefined
  let targetKey: string | undefined
  let designKey: string | undefined
  /** Selected variant and entry index of the shown design; placements are stored under them. */
  let shown: { target: HistoireTarget, index: number } | undefined
  /** Design box size reported by the design element. */
  let size: BoxSize | undefined
  /** Placement while a grip gesture runs; stored only once it ends. */
  let live: OverlayPlacement | undefined
  /** Set on dispose; late image loads and notifications must not touch a retired view. */
  let disposed = false
  // Viewport-space bar: it never follows pan and zoom.
  const bar = createModeBar(overlay, () => {
    if (shown) overlay.reset(shown.target, shown.index)
  })
  bar.node.hidden = true
  root.insertBefore(bar.node, state)

  /** Placement of the shown design in Overlay and Split modes. */
  const placement = (): OverlayPlacement | undefined => {
    if (!shown || !size) return
    return live ?? overlay.placement(shown.target, shown.index) ?? defaultPlacement(FRAME_BOX, size)
  }
  const chrome = createOverlayChrome({
    zoom: () => context.canvas.zoom,
    current: placement,
    onChange: (next) => {
      live = next
      arrange(false)
    },
    onCommit: (next) => {
      live = undefined
      if (shown) overlay.setPlacement(shown.target, shown.index, next)
    },
  })

  /** Follows pan and zoom like built-in arrangements; grips keep their pixel size. */
  const place = () => {
    const { pan, zoom } = context.canvas
    layer.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`
    layer.style.setProperty('--histoire-designs-zoom', String(zoom))
  }

  /**
   * Places the design for the current mode and reports the content boxes.
   * @param refit Ask the canvas to re-read `layout` now; gestures skip it so Fit never moves the camera mid-drag.
   */
  function arrange(refit: boolean): void {
    if (disposed || !size) return
    const mode = overlay.mode()
    root.dataset.mode = mode
    const box = mode === 'side-by-side' ? undefined : placement()
    if (!box) {
      if (designColumn.firstChild !== designLabel.node) designColumn.prepend(designLabel.node)
      chrome.node.remove()
      const column = sideColumn(size)
      placeBox(designColumn, column)
      Object.assign(designColumn.style, { opacity: '', clipPath: '' })
      scaleEmbed(designBox.firstElementChild, size)
      onLayout([FRAME_COLUMN, column])
    }
    else {
      // Laid over the frame, the design label joins the variant label so they never overlap.
      if (designLabel.node.parentNode !== frameLabel) frameLabel.append(designLabel.node)
      if (chrome.node.parentNode !== layer) layer.append(chrome.node)
      placeBox(designColumn, box)
      scaleEmbed(designBox.firstElementChild, size, box)
      designColumn.style.opacity = mode === 'overlay' ? String(overlay.opacity()) : ''
      // Split: the story shows left of the divider, the design right of it.
      designColumn.style.clipPath = mode === 'split' ? `inset(0 0 0 ${box.split * 100}%)` : ''
      chrome.render(box, mode)
      onLayout([overlayBounds(FRAME_COLUMN, box)])
    }
    // `layout` changed outside a canvas measure: Fit frames the new boxes.
    if (refit) context.canvas.requestLayout()
  }

  /**
   * Leases one frame for the selected variant, replacing the previous lease.
   * @param target Selected variant.
   */
  function leaseFrame(target: HistoireTarget): void {
    lease?.abort()
    const own = lease = new AbortController()
    host.signal.addEventListener('abort', () => own.abort(), { once: true, signal: own.signal })
    frameBox.replaceChildren()
    context.canvas.acquireFrame(target, {
      container: frameBox,
      rect: FRAME_BOX,
      queue: true,
      signal: own.signal,
    }).then(granted => granted.ready).catch((error) => {
      if (!isReleased(error) && !own.signal.aborted) host.reportError(error)
    })
  }

  /** Re-renders after a selection, catalog or design switch change. */
  function render(): void {
    if (disposed) return
    const target = context.selection.target
    const designs = target ? model.get(target) : undefined
    const active = target ? model.active(target) : undefined
    const empty = viewState(target, designs, active)
    host.renderState(state, empty)
    bar.node.hidden = Boolean(empty)
    if (empty || !target || !designs || !active) {
      lease?.abort()
      targetKey = designKey = shown = size = live = undefined
      layer.replaceChildren()
      onLayout([])
      return
    }
    if (!layer.childElementCount) layer.append(frameColumn, designColumn)
    const story = `${target.storyId}\0${target.variantId}`
    // Placements are stored per variant design: a new variant or design re-places the overlay.
    const moved = !shown || story !== `${shown.target.storyId}\0${shown.target.variantId}` || active.index !== shown.index
    shown = { target, index: active.index }
    if (moved) live = undefined
    const nextDesign = `${active.index}\0${active.externalUrl}`
    if (nextDesign !== designKey) {
      designKey = nextDesign
      // A late image event of a design switched away must not touch the current one.
      const current = () => !disposed && designKey === nextDesign
      const rendered = createDesignElement(active, {
        onSize: (next) => {
          if (!current()) return
          size = next
          arrange(true)
        },
        onError: () => {
          if (current()) designBox.replaceChildren(imageError(active))
        },
      })
      designBox.replaceChildren(rendered.node)
      size = rendered.size
      arrange(true)
    }
    else if (moved) {
      arrange(true)
    }
    designLabel.render(designs.designs, active.index)
    frameTitle.textContent = model.variant(target)?.title ?? target.variantId
    if (story !== targetKey) {
      targetKey = story
      leaseFrame(target)
    }
  }

  /**
   * Mode, opacity or placement changed: only the arrangement moves, the frame stays leased.
   * Fit re-frames on mode switches only, never after a grip gesture.
   */
  const rearrange = () => arrange(overlay.mode() !== root.dataset.mode)
  const stops = [context.canvas.subscribe(place), model.subscribe(render), overlay.subscribe(rearrange), bar.dispose]
  let stopContext = context.subscribe(render)
  place()
  render()
  return {
    update(next: CanvasViewContext) {
      if (next !== context) {
        stopContext()
        stopContext = next.subscribe(render)
      }
      context = next
      place()
      render()
    },
    dispose() {
      disposed = true
      lease?.abort()
      host.renderState(state, null)
      stopContext()
      stops.forEach(stop => stop())
    },
  }
}

/**
 * `canvas.view` comparing the selected variant with its design: side by side, or laid over it
 * with transparency or a split divider. DOM view: geometry-heavy code stays framework-free.
 * @param model Design model.
 * @param overlay Comparison mode and design placements.
 */
export function sideBySideView(model: DesignModel, overlay: OverlayState): MountView<CanvasViewContext> & Pick<CanvasViewInput, 'layout' | 'toolbar'> {
  /** Content boxes of the latest mount. */
  let rects: HistoireRect[] = []
  /** Latest mount; earlier mounts lost the right to write `rects` (remount before dispose). */
  let owner: object | undefined
  return {
    // Fit frames the content; read on switch, resize, frame registry changes and `requestLayout`.
    layout: () => rects,
    toolbar: ['search', 'tools', 'zoom', 'background', 'ui', 'plugins'],
    mount: (container, context, host) => {
      const token = owner = {}
      const handle = mountSideBySide(container, context, host, model, overlay, (next) => {
        if (owner === token) rects = next
      })
      return {
        update: handle.update,
        dispose() {
          handle.dispose()
          if (owner !== token) return
          owner = undefined
          rects = []
        },
      }
    },
  }
}
