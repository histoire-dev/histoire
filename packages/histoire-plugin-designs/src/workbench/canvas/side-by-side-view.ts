import type { CanvasViewContext, CanvasViewInput, FrameLeaseError, MountView, ViewHost, WorkbenchState } from '@histoire/plugin-kit'
import type { HistoireRect, HistoireTarget } from '@histoire/protocol'
import type { ResolvedDesigns } from '../../designs/resolve.js'
import type { ResolvedDesign } from '../../types.js'
import type { DesignModel } from '../model.js'
import type { BoxSize } from './design-element.js'
import { formatIssue } from '../../designs/resolve.js'
import { createDesignElement, element } from './design-element.js'
import { createDesignLabel } from './design-label.js'

/** Variant frame size in canvas units; fixed, so the leased frame box never goes stale. */
const FRAME: BoxSize = { width: 420, height: 720 }
/** Height of the column labels (variant title, design name or switch) in canvas units. */
const LABEL_HEIGHT = 32
/** Horizontal space between the variant column and the design column in canvas units. */
const GAP = 48

/**
 * Canvas-space boxes (label included) of the variant column and the design column.
 * @param design Design box size.
 */
function columns(design: BoxSize): [HistoireRect, HistoireRect] {
  return [
    { x: 0, y: 0, width: FRAME.width, height: LABEL_HEIGHT + FRAME.height },
    { x: FRAME.width + GAP, y: 0, width: design.width, height: LABEL_HEIGHT + design.height },
  ]
}

/**
 * Whether a lease failure only means the lease was released first (view switched, selection changed).
 * @param error Rejection of `acquireFrame` or `ready`.
 */
function isReleased(error: unknown): boolean {
  return (error as FrameLeaseError)?.name === 'FrameLeaseError' && (error as FrameLeaseError).reason === 'released'
}

/**
 * Full-view state replacing both columns, or `null` when a design can be shown.
 * @param target Selected variant.
 * @param designs Its designs; `undefined` while loading.
 * @param active Its active design.
 */
function viewState(target: HistoireTarget | null | undefined, designs: ResolvedDesigns | undefined, active: ResolvedDesign | undefined): WorkbenchState | null {
  if (!target?.variantId) return { kind: 'empty', icon: 'catalog', title: 'No variant selected' }
  if (!designs) return { kind: 'loading', title: 'Loading designs' }
  if (designs.error !== undefined) return { kind: 'error', title: 'Could not load designs', detail: designs.error }
  if (active) return null
  // Same lines as the inspector tab, so both surfaces explain invalid entries alike.
  if (designs.issues.length) return { kind: 'error', title: 'Design unavailable', detail: designs.issues.map(formatIssue).join('; ') }
  return { kind: 'empty', icon: 'color-palette', title: 'No design', detail: 'Declare meta.design on the story or variant' }
}

/**
 * Error shown in the design box when an image fails to load.
 * @param design Image design.
 */
function imageError(design: ResolvedDesign): HTMLElement {
  const node = element('div', 'histoire-designs-canvas-error')
  node.setAttribute('role', 'alert')
  node.append(element('span', '', `Could not load ${design.name}`), element('span', 'histoire-designs-canvas-url', design.externalUrl))
  return node
}

/**
 * Renders the selected variant in a leased frame next to its active design.
 * @param container Host-owned view container.
 * @param initial First canvas-scoped context.
 * @param host View host services.
 * @param model Design model.
 * @param onLayout Receives the column boxes, read by the view's `layout` for Fit.
 */
function mountSideBySide(container: HTMLElement, initial: CanvasViewContext, host: ViewHost, model: DesignModel, onLayout: (rects: HistoireRect[]) => void) {
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
  const frameBox = element('div', 'histoire-designs-canvas-box')
  Object.assign(frameBox.style, { width: `${FRAME.width}px`, height: `${FRAME.height}px` })
  frameColumn.append(frameLabel, frameBox)
  const designColumn = element('div', 'histoire-designs-canvas-column')
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
  /** Set on dispose; late image loads and notifications must not touch a retired view. */
  let disposed = false

  /** Follows pan and zoom like built-in arrangements. */
  const place = () => {
    const { pan, zoom } = context.canvas
    layer.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`
  }

  /**
   * Places both columns for a design box size.
   * @param size Design box size.
   */
  function resize(size: BoxSize): void {
    if (disposed) return
    const [frameRect, designRect] = columns(size)
    for (const [column, rect] of [[frameColumn, frameRect], [designColumn, designRect]] as const) {
      Object.assign(column.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` })
    }
    onLayout([frameRect, designRect])
    // `layout` changed outside a canvas measure: Fit frames the new columns.
    context.canvas.requestLayout()
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
      rect: { x: 0, y: LABEL_HEIGHT, ...FRAME },
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
    if (empty || !target || !designs || !active) {
      lease?.abort()
      targetKey = designKey = undefined
      layer.replaceChildren()
      onLayout([])
      return
    }
    if (!layer.childElementCount) layer.append(frameColumn, designColumn)
    const nextDesign = `${active.index}\0${active.externalUrl}`
    if (nextDesign !== designKey) {
      designKey = nextDesign
      // A late image event of a design switched away must not touch the current one.
      const current = () => !disposed && designKey === nextDesign
      const rendered = createDesignElement(active, {
        onSize: (next) => {
          if (current()) resize(next)
        },
        onError: () => {
          if (current()) designBox.replaceChildren(imageError(active))
        },
      })
      designBox.replaceChildren(rendered.node)
      resize(rendered.size)
    }
    designLabel.render(designs.designs, active.index)
    const story = `${target.storyId}\0${target.variantId}`
    frameLabel.textContent = model.variant(target)?.title ?? target.variantId
    if (story !== targetKey) {
      targetKey = story
      leaseFrame(target)
    }
  }

  const stops = [context.canvas.subscribe(place), model.subscribe(render)]
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
 * `canvas.view` placing the selected variant next to its design. DOM view: geometry-heavy
 * code stays framework-free.
 * @param model Design model.
 */
export function sideBySideView(model: DesignModel): MountView<CanvasViewContext> & Pick<CanvasViewInput, 'layout' | 'toolbar'> {
  /** Column boxes of the latest mount. */
  let rects: HistoireRect[] = []
  /** Latest mount; earlier mounts lost the right to write `rects` (remount before dispose). */
  let owner: object | undefined
  return {
    // Fit frames both columns; read on switch, resize, frame registry changes and `requestLayout`.
    layout: () => rects,
    toolbar: ['search', 'tools', 'zoom', 'background', 'ui', 'plugins'],
    mount: (container, context, host) => {
      const token = owner = {}
      const handle = mountSideBySide(container, context, host, model, (next) => {
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
