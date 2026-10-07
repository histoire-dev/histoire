import type { CanvasArrangement, CanvasPreferences, CanvasStorage, CanvasTool, CanvasZoom, CanvasZoomByArrange } from './canvas.js'
import { clampZoom } from '../components/canvas/pan/usePanZoom.js'

const CANVAS_ARRANGEMENTS: readonly CanvasArrangement[] = ['single', 'grid', 'list', 'matrix']

/** Converts persisted input into a supported canvas zoom preference. */
function readZoom(value: unknown): CanvasZoom | undefined {
  if (value === 'fit') return value
  return typeof value === 'number' && Number.isFinite(value) ? clampZoom(value) : undefined
}

/** Creates independent default zoom preferences rather than sharing mutable state. */
function defaultZoomByArrange(): CanvasZoomByArrange {
  return { single: 'fit', grid: 'fit', list: 'fit', matrix: 'fit' }
}

/** Storage getter itself may throw in sandboxed or private browsing contexts. */
export function getCanvasStorage(window?: Pick<Window, 'localStorage'>): CanvasStorage | undefined {
  try {
    return window?.localStorage
  }
  catch { return undefined }
}

/** Validate saved values without trusting obsolete or corrupt local preferences. */
export function readCanvasPreferences(storage?: CanvasStorage): CanvasPreferences {
  const defaults: CanvasPreferences = { zoomByArrange: defaultZoomByArrange(), tool: 'select', frameBackground: 'transparent' }
  try {
    const saved = JSON.parse(storage?.getItem('_histoire-ui-canvas') ?? 'null')
    if (!saved || typeof saved !== 'object') return defaults
    // Legacy measurement could coexist with Pan; preserve its intent as the exclusive tool.
    const tool: CanvasTool = saved.tool === 'measure' || saved.measure === true ? 'measure' : saved.tool === 'pan' ? 'pan' : 'select'
    // Legacy books saved one zoom. Fan it out so every arrangement opens at the familiar scale.
    const legacyZoom = readZoom(saved.zoom)
    const savedZooms = saved.zoomByArrange && typeof saved.zoomByArrange === 'object' ? saved.zoomByArrange : {}
    const zoomByArrange = Object.fromEntries(CANVAS_ARRANGEMENTS.map((arrangement) => {
      // Single zoom was forced to 100% before version 3, so old values carry no user intent.
      if (arrangement === 'single') return [arrangement, saved.version === 3 ? readZoom(savedZooms.single) ?? 'fit' : 'fit']
      const zoom = readZoom(savedZooms[arrangement]) ?? legacyZoom ?? defaults.zoomByArrange[arrangement]
      return [arrangement, zoom]
    })) as CanvasZoomByArrange
    return { zoomByArrange, tool, frameBackground: typeof saved.frameBackground === 'string' ? saved.frameBackground : defaults.frameBackground }
  }
  catch { return defaults }
}
