import type { HistoireRect } from '@histoire/protocol'
import type { ContributionBase } from './base.js'
import type { WorkbenchIcon } from './common.js'
import type { CanvasScopedContext, FrameHeaderContext, FrameRef, FrameScopedContext } from './context.js'
import type { CanvasPoint, CanvasService } from './services.js'
import type { ToolbarGroup } from './toolbar.js'
import type { ContributionView } from './view.js'

/**
 * Overlay layer across the viewport (`viewport`: origin at the viewport's top-left corner, one
 * unit per CSS pixel) or following pan and zoom (`canvas`: origin and units of canvas space,
 * transformed by `translate(pan) scale(zoom)`).
 */
export type CanvasOverlayInput = ContributionBase<CanvasScopedContext> & {
  /** Coordinate space of the layer. */
  space: 'viewport' | 'canvas'
  /** Receive pointer events; passive overlays never intercept story pointer events. */
  interactive?: boolean
} & ContributionView<CanvasScopedContext>

/**
 * Overlay instantiated once per rendered frame (two frames of one variant get two instances),
 * sized and positioned over that frame's rendered document box in viewport pixels.
 */
export type CanvasFrameOverlayInput = ContributionBase<FrameScopedContext> & {
  /** Receive pointer events; passive overlays never intercept story pointer events. */
  interactive?: boolean
} & ContributionView<FrameScopedContext>

/** Color of a frame header badge: `danger` and `warning` for problems, `accent` for highlights. */
export type CanvasFrameBadgeTone = 'neutral' | 'accent' | 'warning' | 'danger'

/** Frame header badge with a tone and an accessible description. */
export interface CanvasFrameBadgeValue {
  /** Short visible text, usually a count. */
  text: string | number
  /** Badge color; `neutral` by default. */
  tone?: CanvasFrameBadgeTone
  /** Full description for tooltips and assistive technology (e.g. `3 accessibility violations`). */
  label?: string
}

/**
 * Badge shown in the header of every laid-out canvas frame, next to the variant title. The
 * callback is re-read on context, registry and `api.invalidate()` changes; returning `null`,
 * `undefined` or `''` hides the badge for that frame.
 */
export type CanvasFrameBadgeInput = ContributionBase<FrameHeaderContext> & {
  /** Badge of one frame. */
  badge: (context: FrameHeaderContext) => string | number | CanvasFrameBadgeValue | null | undefined
}

/** Pointer event delivered to an active canvas tool. */
export interface CanvasToolPointerEvent {
  /** Original DOM event. */
  readonly event: PointerEvent
  /** Pointer position in viewport-local coordinates. */
  readonly viewport: CanvasPoint
  /** Pointer position in canvas space. */
  readonly canvas: CanvasPoint
  /** Frame under the pointer, if any. */
  readonly frame: FrameRef | null
}

/**
 * Pointer handler of a canvas tool; runs only after built-in pan declines the gesture.
 * A throwing handler is recorded as a diagnostic and the canvas falls back to Select.
 */
export type CanvasToolPointerHandler = (event: CanvasToolPointerEvent, context: CanvasScopedContext) => void

/**
 * Tool added to the canvas tool switch. While active it receives pointer input over the whole
 * canvas (frames included); Space and middle-button panning stay with the canvas.
 */
export type CanvasToolInput = ContributionBase<CanvasScopedContext> & {
  /** Visible label. */
  label: string
  /** Tool icon. */
  icon: WorkbenchIcon
  /** CSS cursor while the tool is active. */
  cursor?: string
  /** Keys activating the tool, registered in the workbench shortcut registry (`canvas` scope). */
  shortcut?: readonly string[]
  /** Primary-button gesture start; the pointer is captured until up or cancel. */
  onPointerDown?: CanvasToolPointerHandler
  /** Pointer movement over the canvas, during a gesture or hovering; suspended while panning. */
  onPointerMove?: CanvasToolPointerHandler
  /** Gesture end. */
  onPointerUp?: CanvasToolPointerHandler
  /** Gesture cancelled (Escape, pan takeover, tool switch or removal). */
  onCancel?: (context: CanvasScopedContext) => void
  /** Tool was switched away, removed, or its viewport disposed; retire any remaining work. */
  onDeactivate?: (context: CanvasScopedContext) => void
}

/** Canvas service of one mounted custom view: the viewport service plus layout invalidation. */
export interface CanvasViewService extends CanvasService {
  /**
   * Tell the canvas this view's `layout` changed. The canvas re-reads it once after the current
   * update (calls coalesce) and applies the view's zoom policy: Fit frames the new boxes, a
   * fixed zoom keeps the camera. No-op once the view is switched away.
   */
  requestLayout: () => void
}

/** Context of one mounted custom view. */
export interface CanvasViewContext extends CanvasScopedContext {
  /** Canvas service of the view, with `requestLayout`. */
  readonly canvas: CanvasViewService
}

/**
 * Arrangement added beside Grid, List and Matrix. The view covers the canvas body in viewport
 * pixels and places content with `context.canvas` transforms; frames it leases through that
 * context may use the whole viewport budget and are released when the view is switched away.
 *
 * Pointer input: like a story frame, view content receives primary presses with the Select tool
 * (the canvas neither pans nor takes focus); the Pan tool, held Space and the middle button pan
 * the canvas and never reach the content. A press whose target element itself carries the
 * `data-histoire-canvas-pan` attribute (not its descendants) behaves like a press on empty
 * canvas; mark full-size backgrounds with it.
 */
export type CanvasViewInput = ContributionBase<CanvasScopedContext> & {
  /** Visible label. */
  label: string
  /** Arrangement icon. */
  icon: WorkbenchIcon
  /**
   * Content boxes in canvas space at a candidate zoom, used by Fit (pass-through zoom lets
   * fixed-pixel chrome scale inversely). Read when the canvas measures: on switch, resize, frame
   * registry changes and `context.canvas.requestLayout()`. Views without a layout opt out of
   * fitting; Fit keeps the camera.
   */
  layout?: (zoom: number) => ReadonlyArray<HistoireRect>
  /**
   * Toolbar groups shown while the view is active; omitted shows every group. The arrangement
   * switch (`arrange`) and the inspector toggle (`inspector`) always show.
   */
  toolbar?: ReadonlyArray<ToolbarGroup>
} & ContributionView<CanvasViewContext>

/** Registered canvas overlay. */
export type CanvasOverlayContribution = CanvasOverlayInput & { kind: 'canvas.overlay' }

/** Registered per-frame overlay. */
export type CanvasFrameOverlayContribution = CanvasFrameOverlayInput & { kind: 'canvas.frame-overlay' }

/** Registered frame header badge. */
export type CanvasFrameBadgeContribution = CanvasFrameBadgeInput & { kind: 'canvas.frame-badge' }

/** Registered canvas tool. */
export type CanvasToolContribution = CanvasToolInput & { kind: 'canvas.tool' }

/** Registered canvas view. */
export type CanvasViewContribution = CanvasViewInput & { kind: 'canvas.view' }
