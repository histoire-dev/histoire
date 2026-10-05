/** A point in canvas or local client coordinates. */
export interface CanvasPoint {
  /** Horizontal coordinate in pixels. */
  x: number
  /** Vertical coordinate in pixels. */
  y: number
}

/** Dimensions in pixels. */
export interface CanvasSize {
  /** Horizontal extent. */
  width: number
  /** Vertical extent. */
  height: number
}

/** Bounds in canvas coordinates. */
export interface CanvasRect extends CanvasPoint, CanvasSize {}

/** Space reserved when fitting canvas bounds. */
export interface CanvasFitOptions {
  /** Padding around content, defaults to 48 pixels. */
  padding?: number
  /** Width of an inspector covering the viewport's right edge. */
  inspectorWidth?: number
  /** Fixed controls above canvas content, in client pixels. */
  topInset?: number
  /** Fixed controls below canvas content, in client pixels. */
  bottomInset?: number
}

/** Store-independent access to the active canvas transform. */
export interface PanZoomState {
  /** Reads the effective numeric zoom. */
  getZoom: () => number
  /** Writes the effective numeric zoom. */
  setZoom: (zoom: number) => void
  /** Reads the translation in local client pixels. */
  getOffset: () => CanvasPoint
  /** Writes the translation in local client pixels. */
  setOffset: (offset: CanvasPoint) => void
}

/** Keeps zoom within the supported 10%–400% range. */
export function clampZoom(value: number): number {
  return Number.isNaN(value) ? 1 : Math.min(4, Math.max(0.1, value))
}

/** Converts canvas coordinates into pixels relative to the viewport. */
export function canvasToClient(point: CanvasPoint, zoom: number, offset: CanvasPoint): CanvasPoint {
  return { x: point.x * zoom + offset.x, y: point.y * zoom + offset.y }
}

/** Converts local viewport pixels into canvas coordinates. */
export function clientToCanvas(point: CanvasPoint, zoom: number, offset: CanvasPoint): CanvasPoint {
  const safeZoom = clampZoom(zoom)
  return { x: (point.x - offset.x) / safeZoom, y: (point.y - offset.y) / safeZoom }
}

/** Changes zoom while keeping the canvas point beneath the cursor stationary. */
export function zoomAroundPoint(zoom: number, nextZoom: number, offset: CanvasPoint, point: CanvasPoint) {
  const anchor = clientToCanvas(point, zoom, offset)
  const clamped = clampZoom(nextZoom)
  return {
    zoom: clamped,
    offset: { x: point.x - anchor.x * clamped, y: point.y - anchor.y * clamped },
  }
}

/** Centers bounds within available viewport space, excluding the inspector. */
export function fitCanvas(bounds: CanvasRect, viewport: CanvasSize, options: CanvasFitOptions = {}) {
  const padding = Math.max(0, options.padding ?? 48)
  const topInset = Math.max(0, options.topInset ?? 0)
  const bottomInset = Math.max(0, options.bottomInset ?? 0)
  const width = Math.max(1, viewport.width - Math.max(0, options.inspectorWidth ?? 0) - padding * 2)
  const height = Math.max(1, viewport.height - topInset - bottomInset - padding * 2)
  const zoom = clampZoom(Math.min(width / Math.max(1, bounds.width), height / Math.max(1, bounds.height)))
  return {
    zoom,
    offset: {
      x: padding + (width - bounds.width * zoom) / 2 - bounds.x * zoom,
      y: topInset + padding + (height - bounds.height * zoom) / 2 - bounds.y * zoom,
    },
  }
}

/** Provides transform operations against a caller-owned store. */
export function usePanZoom(state: PanZoomState) {
  /** Applies a cursor-anchored zoom. */
  function zoomAt(zoom: number, point: CanvasPoint) {
    const next = zoomAroundPoint(state.getZoom(), zoom, state.getOffset(), point)
    state.setOffset(next.offset)
    state.setZoom(next.zoom)
  }

  /** Translates by a delta in client pixels, independently of zoom. */
  function panBy(delta: CanvasPoint) {
    const offset = state.getOffset()
    state.setOffset({ x: offset.x + delta.x, y: offset.y + delta.y })
  }

  /** Fits content and persists the resulting transform. */
  function fit(bounds: CanvasRect, viewport: CanvasSize, options?: CanvasFitOptions) {
    const next = fitCanvas(bounds, viewport, options)
    state.setOffset(next.offset)
    state.setZoom(next.zoom)
  }

  /** Converts a canvas point using the current transform. */
  function toClient(point: CanvasPoint) {
    return canvasToClient(point, state.getZoom(), state.getOffset())
  }

  /** Converts a viewport point using the current transform. */
  function toCanvas(point: CanvasPoint) {
    return clientToCanvas(point, state.getZoom(), state.getOffset())
  }

  return { zoomAt, panBy, fit, toClient, toCanvas }
}
