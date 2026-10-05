import type { CanvasFrameLayout } from '../components/canvas/frame-layout.js'
import type { CanvasFitOptions, CanvasPoint, CanvasRect, CanvasSize } from '../components/canvas/pan/usePanZoom.js'
import { reactive } from 'vue'
import { clampZoom, fitCanvas, zoomAroundPoint } from '../components/canvas/pan/usePanZoom.js'

/** Persistent canvas pointer mode. */
export type CanvasTool = 'select' | 'pan' | 'measure'

/** Saved canvas preferences; transform and selection belong to current mount. */
export interface CanvasPreferences {
  /** Logical scale or automatic extent fitting. */
  zoom: number | 'fit'
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

/** Storage getter itself may throw in sandboxed or private browsing contexts. */
export function getCanvasStorage(window?: Pick<Window, 'localStorage'>): CanvasStorage | undefined {
  try {
    return window?.localStorage
  }
  catch { return undefined }
}

/** Validate saved values without trusting obsolete or corrupt local preferences. */
function readPreferences(storage?: CanvasStorage): CanvasPreferences {
  const defaults: CanvasPreferences = { zoom: 'fit', tool: 'select', frameBackground: 'transparent' }
  try {
    const saved = JSON.parse(storage?.getItem('_histoire-ui-canvas') ?? 'null')
    if (!saved || typeof saved !== 'object') return defaults
    // Legacy measurement could coexist with Pan; preserve its intent as the exclusive tool.
    const tool: CanvasTool = saved.tool === 'measure' || saved.measure === true ? 'measure' : saved.tool === 'pan' ? 'pan' : 'select'
    return { zoom: saved.zoom === 'fit' ? 'fit' : typeof saved.zoom === 'number' ? clampZoom(saved.zoom) : defaults.zoom, tool, frameBackground: typeof saved.frameBackground === 'string' ? saved.frameBackground : defaults.frameBackground }
  }
  catch { return defaults }
}

/** Create independent canvas state; nearest shell provides instance to its tools. */
export function createCanvasStore(options: { storage?: CanvasStorage } = {}) {
  const preferences = readPreferences(options.storage)
  const state = reactive({ ...preferences, effectiveZoom: preferences.zoom === 'fit' ? 1 : preferences.zoom, panOffset: { x: 32, y: 72 }, selectedFrame: null as string | null, viewport: { width: 0, height: 0 }, bounds: { x: 0, y: 0, width: 0, height: 0 }, inspectorWidth: 0, contentInsets: { topInset: 0, bottomInset: 0 }, frameBackgrounds: {} as Record<string, { backgroundColor: string, checkerboard: boolean }>, panning: false })
  /** Persist only contract preferences; failures leave usable current-session state. */
  function save() {
    try {
      options.storage?.setItem('_histoire-ui-canvas', JSON.stringify({ zoom: state.zoom, tool: state.tool, frameBackground: state.frameBackground }))
    }
    catch { /* Private browsing storage can be unavailable. */ }
  }
  /** Recompute transform when fit is selected or geometry changes. */
  function fit() {
    state.zoom = 'fit'
    // Setup runs before ResizeObserver measures; fitting an empty viewport would lock at 10%.
    if (state.viewport.width <= state.inspectorWidth || state.viewport.height <= state.contentInsets.topInset + state.contentInsets.bottomInset) return save()
    const transform = fitCanvas(state.bounds, state.viewport, { padding: 32, inspectorWidth: state.inspectorWidth, ...state.contentInsets })
    if (Math.abs(state.effectiveZoom - transform.zoom) > 0.0001) state.effectiveZoom = transform.zoom
    state.panOffset = transform.offset
    save()
  }
  /** Switch zoom around current visible point rather than jumping canvas origin. */
  function setZoom(value: number | 'fit', point?: CanvasPoint) {
    if (value === 'fit') return fit()
    const transform = zoomAroundPoint(state.effectiveZoom, value, state.panOffset, point ?? { x: state.viewport.width / 2, y: state.viewport.height / 2 })
    state.zoom = transform.zoom
    state.effectiveZoom = transform.zoom
    state.panOffset = transform.offset
    save()
  }
  /** Geometry comes from canvas adapter, never transformed DOM dimensions. */
  function setGeometry(viewport: CanvasSize, bounds: CanvasRect, inspectorWidth = 0, insets: CanvasContentInsets = {}) {
    const nextInsets = { topInset: Math.max(0, insets.topInset ?? 0), bottomInset: Math.max(0, insets.bottomInset ?? 0) }
    // Moving between arrangements moves their content origin while keeping explicit zoom and pan.
    if (state.zoom !== 'fit') state.panOffset = { x: state.panOffset.x, y: state.panOffset.y + nextInsets.topInset - state.contentInsets.topInset }
    state.viewport = viewport
    state.bounds = bounds
    state.inspectorWidth = inspectorWidth
    state.contentInsets = nextInsets
    if (state.zoom === 'fit') fit()
    else state.effectiveZoom = state.zoom
  }
  /** Shift canvas without changing selected variant. */
  function panBy(delta: CanvasPoint) {
    state.panOffset = { x: state.panOffset.x + delta.x, y: state.panOffset.y + delta.y }
    state.zoom = state.effectiveZoom
  }
  /** Reveal logical frame bounds without changing canonical frame selection. */
  function revealFrame(frame: CanvasFrameLayout) {
    if (state.viewport.width <= state.inspectorWidth || state.viewport.height <= state.contentInsets.topInset + state.contentInsets.bottomInset) return
    const zoom = state.effectiveZoom
    const right = Math.max(0, state.viewport.width - state.inspectorWidth - 24)
    const left = frame.x * zoom + state.panOffset.x
    const top = frame.y * zoom + state.panOffset.y
    const dx = left < 24 ? 24 - left : left + frame.width * zoom > right ? right - left - frame.width * zoom : 0
    const topLimit = Math.max(64, state.contentInsets.topInset + 24)
    const bottomLimit = state.viewport.height - state.contentInsets.bottomInset - 24
    const dy = top < topLimit ? topLimit - top : top + frame.height * zoom > bottomLimit ? bottomLimit - top - frame.height * zoom : 0
    // Automatic selection visibility must not turn the user's Fit preference into numeric zoom.
    if (dx || dy) state.panOffset = { x: state.panOffset.x + dx, y: state.panOffset.y + dy }
  }
  /** Bring URL-selected frame into unobstructed canvas area. */
  function focusFrame(frame: CanvasFrameLayout) {
    state.selectedFrame = frame.id
    revealFrame(frame)
  }
  /** Fit one selected preview using same available geometry as whole-canvas fit. */
  function zoomToFrame(frame: CanvasRect) {
    const transform = fitCanvas(frame, state.viewport, { padding: 32, inspectorWidth: state.inspectorWidth, ...state.contentInsets })
    state.zoom = transform.zoom
    state.effectiveZoom = transform.zoom
    state.panOffset = transform.offset
    save()
  }
  return Object.assign(state, { setZoom, fit, setGeometry, panBy, revealFrame, focusFrame, zoomToFrame,
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
    setFrameBackground(id: string, backgroundColor: string, checkerboard = false) { state.frameBackgrounds[id] = { backgroundColor, checkerboard } } })
}

/** Injectable canvas backing inferred from constructor. */
export type CanvasStore = ReturnType<typeof createCanvasStore>
