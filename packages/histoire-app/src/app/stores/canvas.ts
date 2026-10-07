import type { CanvasFrameLayout } from '../components/canvas/frame-layout.js'
import type { CanvasFitOptions, CanvasPoint, CanvasRect, CanvasSize } from '../components/canvas/pan/usePanZoom.js'
import type { SingleViewportState } from '../components/canvas/single-viewport.js'
import type { SingleZoomListener } from '../components/canvas/single-zoom.js'
import type { CanvasBackground } from '../util/background.js'
import { reactive } from 'vue'
import { canvasContentRect, clampZoom, fitCanvas, zoomAroundPoint } from '../components/canvas/pan/usePanZoom.js'
import { fitSingleViewport } from '../components/canvas/single-zoom.js'

import { readCanvasPreferences } from './canvas-preferences.js'

export { getCanvasStorage } from './canvas-preferences.js'

/** Persistent canvas pointer mode. */
export type CanvasTool = 'select' | 'pan' | 'measure'

/** Canvas arrangements each retain their own local zoom preference. */
export type CanvasArrangement = 'single' | 'grid' | 'list' | 'matrix'

/** Logical scale or automatic extent fitting. */
export type CanvasZoom = number | 'fit'

/** Locally persisted zoom preference for every available canvas arrangement. */
export type CanvasZoomByArrange = Record<CanvasArrangement, CanvasZoom>

/** Session-owned view state saved separately for each story. */
export interface CanvasViewSnapshot {
  /** Requested arrangement, before any temporary Matrix fallback. */
  arrangement: CanvasArrangement
  /** Independent zoom preference for each arrangement. */
  zoomByArrange: CanvasZoomByArrange
  /** Canvas translation in viewport CSS pixels. */
  panOffset: CanvasPoint
}

/** Persistent canvas preferences; per-story transforms use workbench memory. */
export interface CanvasPreferences {
  /** Independent zoom preference for each arrangement. */
  zoomByArrange: CanvasZoomByArrange
  /** Persistent pointer mode. */
  tool: CanvasTool
  /** Frame-only CSS background. */
  frameBackground: string
}

/** Optional local-storage port avoids shared mutable state and browser-only imports. */
export interface CanvasStorage {
  /** Read saved preference JSON. */
  getItem: (key: string) => string | null
  /** Write saved preference JSON. */
  setItem: (key: string, value: string) => void
}

/** Fixed canvas chrome belongs to layout geometry, never saved user preferences. */
export type CanvasContentInsets = Pick<CanvasFitOptions, 'topInset' | 'bottomInset'>

/** Create independent canvas state; nearest shell provides instance to its tools. */
export function createCanvasStore(options: { storage?: CanvasStorage, singleViewport?: SingleViewportState } = {}) {
  const preferences = readCanvasPreferences(options.storage)
  const state = reactive({ ...preferences, singleViewport: options.singleViewport ?? { mode: 'responsive' as const }, singleViewportSize: { width: 1, height: 1 }, arrangement: 'grid' as CanvasArrangement, zoom: preferences.zoomByArrange.grid, effectiveZoom: typeof preferences.zoomByArrange.grid === 'number' ? preferences.zoomByArrange.grid : 1, panOffset: { x: 32, y: 32 }, selectedFrame: null as string | null, viewport: { width: 0, height: 0 }, bounds: { x: 0, y: 0, width: 0, height: 0 }, inspectorWidth: 0, contentInsets: { topInset: 0, bottomInset: 0 }, frameBackgrounds: {} as Record<string, CanvasBackground>, panning: false })
  let singleArea: CanvasSize = { width: 0, height: 0 }
  const singleZoomListeners = new Set<SingleZoomListener>()
  /** Notify native scroll ownership before replacing the rendered scale. */
  function applySingleZoom(zoom: number, point?: CanvasPoint, fit = false) {
    state.effectiveZoom = zoom
    singleZoomListeners.forEach(listener => listener(zoom, point, fit))
  }
  /** Share unobstructed geometry between fitting, zoom anchors and selection reveal. */
  function contentRect() {
    return canvasContentRect(state.viewport, { inspectorWidth: state.inspectorWidth, ...state.contentInsets })
  }
  /** Persist only contract preferences; failures leave usable current-session state. */
  function save() {
    try {
      options.storage?.setItem('_histoire-ui-canvas', JSON.stringify({ version: 3, zoomByArrange: state.zoomByArrange, tool: state.tool, frameBackground: state.frameBackground }))
    }
    catch { /* Private browsing storage can be unavailable. */ }
  }
  /** Updates active arrangement preference without mutating another view's scale. */
  function setActiveZoom(zoom: CanvasZoom) {
    state.zoom = zoom
    state.zoomByArrange[state.arrangement] = zoom
  }
  /** Restore one view's zoom preference before its replacement geometry is measured. */
  function setArrangement(arrangement: CanvasArrangement) {
    if (state.arrangement === arrangement) return
    state.arrangement = arrangement
    const zoom = state.zoomByArrange[arrangement]
    state.zoom = zoom
    if (typeof zoom === 'number') state.effectiveZoom = zoom
    else if (arrangement === 'single') fit()
    save()
  }
  /** Recompute transform when fit is selected or geometry changes. */
  function fit() {
    setActiveZoom('fit')
    if (state.arrangement === 'single') {
      if (singleArea.width && singleArea.height) applySingleZoom(fitSingleViewport(singleArea, state.singleViewportSize), undefined, true)
      return save()
    }
    // Setup runs before ResizeObserver measures; fitting an empty viewport would lock at 10%.
    const content = contentRect()
    if (!content.width || !content.height) return save()
    const transform = fitCanvas(state.bounds, state.viewport, { padding: 32, inspectorWidth: state.inspectorWidth, ...state.contentInsets })
    if (Math.abs(state.effectiveZoom - transform.zoom) > 0.0001) state.effectiveZoom = transform.zoom
    state.panOffset = transform.offset
    save()
  }
  /** Switch zoom around current visible point rather than jumping canvas origin. */
  function setZoom(value: number | 'fit', point?: CanvasPoint) {
    if (value === 'fit') return fit()
    if (state.arrangement === 'single') {
      const zoom = clampZoom(value)
      setActiveZoom(zoom)
      applySingleZoom(zoom, point)
      return save()
    }
    const content = contentRect()
    const transform = zoomAroundPoint(state.effectiveZoom, value, state.panOffset, point ?? { x: content.x + content.width / 2, y: content.y + content.height / 2 })
    setActiveZoom(transform.zoom)
    state.effectiveZoom = transform.zoom
    state.panOffset = transform.offset
    save()
  }
  /** Publish unscaled Single geometry; numeric zoom stays fixed during resizing. */
  function setSingleGeometry(area: CanvasSize, size: CanvasSize) {
    singleArea = area
    state.singleViewportSize = size
    if (state.arrangement === 'single' && state.zoom === 'fit') fit()
  }
  /** Geometry comes from canvas adapter, never transformed DOM dimensions. */
  function setGeometry(viewport: CanvasSize, bounds: CanvasRect, inspectorWidth = 0, insets: CanvasContentInsets = {}) {
    const nextInsets = { topInset: Math.max(0, insets.topInset ?? 0), bottomInset: Math.max(0, insets.bottomInset ?? 0) }
    // Moving between arrangements moves their content origin while keeping explicit zoom and pan.
    if (state.arrangement !== 'single' && typeof state.zoom === 'number' && nextInsets.topInset !== state.contentInsets.topInset) state.panOffset = { x: state.panOffset.x, y: state.panOffset.y + nextInsets.topInset - state.contentInsets.topInset }
    state.viewport = viewport
    state.bounds = bounds
    state.inspectorWidth = inspectorWidth
    state.contentInsets = nextInsets
    if (state.zoom === 'fit') fit()
    else state.effectiveZoom = state.zoom
  }
  /** Shift canvas without changing selected variant. */
  function panBy(delta: CanvasPoint) {
    if (state.arrangement === 'single') return
    state.panOffset = { x: state.panOffset.x + delta.x, y: state.panOffset.y + delta.y }
    setActiveZoom(state.effectiveZoom)
  }
  /** Update drag-owned translation while retaining the active arrangement's effective scale. */
  function setPanOffset(offset: CanvasPoint) {
    if (state.arrangement === 'single') return
    state.panOffset = offset
    setActiveZoom(state.effectiveZoom)
  }
  /** Capture view state without geometry, selection, tool, or frame preferences. */
  function snapshotView(arrangement = state.arrangement): CanvasViewSnapshot {
    return { arrangement, zoomByArrange: { ...state.zoomByArrange }, panOffset: { ...state.panOffset } }
  }
  /** Restore view state before measuring new story geometry. */
  function restoreView(snapshot: CanvasViewSnapshot) {
    state.zoomByArrange = { ...snapshot.zoomByArrange }
    state.arrangement = snapshot.arrangement
    state.zoom = state.zoomByArrange[snapshot.arrangement]
    if (typeof state.zoom === 'number') {
      if (state.arrangement === 'single') applySingleZoom(state.zoom)
      else state.effectiveZoom = state.zoom
    }
    else if (state.arrangement === 'single') {
      fit()
    }
    state.panOffset = { ...snapshot.panOffset }
  }
  /** Reveal logical frame bounds without changing canonical frame selection. */
  function revealFrame(frame: CanvasFrameLayout) {
    if (state.arrangement === 'single') return
    const content = contentRect()
    if (!content.width || !content.height) return
    const zoom = state.effectiveZoom
    const left = frame.x * zoom + state.panOffset.x
    const top = frame.y * zoom + state.panOffset.y
    const leftLimit = content.x + 24
    const rightLimit = content.x + content.width - 24
    const topLimit = content.y + 24
    const bottomLimit = content.y + content.height - 24
    // Oversized previews cannot show both edges; keep labels and leading content visible.
    const dx = frame.width * zoom > rightLimit - leftLimit || left < leftLimit ? leftLimit - left : left + frame.width * zoom > rightLimit ? rightLimit - left - frame.width * zoom : 0
    const dy = frame.height * zoom > bottomLimit - topLimit || top < topLimit ? topLimit - top : top + frame.height * zoom > bottomLimit ? bottomLimit - top - frame.height * zoom : 0
    // Automatic selection visibility must not turn the user's Fit preference into numeric zoom.
    if (dx || dy) state.panOffset = { x: state.panOffset.x + dx, y: state.panOffset.y + dy }
  }
  /** Synchronize selected frame identity without moving the canvas. */
  function selectFrame(frame: CanvasFrameLayout) {
    state.selectedFrame = frame.id
  }
  /** Bring URL-selected frame into unobstructed canvas area. */
  function focusFrame(frame: CanvasFrameLayout) {
    selectFrame(frame)
    revealFrame(frame)
  }
  /** Fit selection and fixed chrome using the same available viewport as canvas Fit. */
  function zoomToFrame(frame: CanvasRect | ((zoom: number) => CanvasRect)) {
    if (state.arrangement === 'single') return fit()
    const content = contentRect()
    if (!content.width || !content.height) return
    const options = { padding: 32, inspectorWidth: state.inspectorWidth, ...state.contentInsets }
    let zoom = state.effectiveZoom
    let transform = fitCanvas(typeof frame === 'function' ? frame(zoom) : frame, state.viewport, options)
    // Labels/gaps stay in screen pixels: resolve their world bounds at each candidate scale.
    if (typeof frame === 'function') {
      for (let pass = 0; Math.abs(transform.zoom - zoom) > 0.000001 && pass < 32; pass++) {
        zoom = transform.zoom
        transform = fitCanvas(frame(zoom), state.viewport, options)
      }
    }
    setActiveZoom(transform.zoom)
    state.effectiveZoom = transform.zoom
    state.panOffset = transform.offset
    save()
  }
  return Object.assign(state, { setZoom, setArrangement, fit, setGeometry, setSingleGeometry, panBy, setPanOffset, snapshotView, restoreView, revealFrame, selectFrame, focusFrame, zoomToFrame,
    /** Subscribe one mounted native scroll owner; cleanup retires its captured element. */
    onSingleZoom(listener: SingleZoomListener): () => void {
      singleZoomListeners.add(listener)
      return () => {
        singleZoomListeners.delete(listener)
      }
    },
    /** Choose persistent pointer mode. */
    setTool(tool: CanvasPreferences['tool']) {
      state.tool = tool
      save()
    },
    /** Update shared frame background preference. */
    setBackground(background: string) {
      state.frameBackground = background
      save()
    },
    /** Keep selected-only backgrounds independent of project preview settings. */
    setFrameBackground(id: string, backgroundColor: string, checkerboard = false, checkerboardTheme: CanvasBackground['checkerboardTheme'] = 'light') { state.frameBackgrounds[id] = { backgroundColor, checkerboard, checkerboardTheme } } })
}

/** Injectable canvas backing inferred from constructor. */
export type CanvasStore = ReturnType<typeof createCanvasStore>
