import type { CanvasRect, CanvasSize } from './pan/usePanZoom.js'
import { getHistoireTargetKey } from '@histoire/protocol'

/** Rendered height of the interactive title above every preview frame. */
export const CANVAS_FRAME_LABEL_HEIGHT = 28

/** Grid retains its existing vertical reserve for frame chrome. */
const GRID_FRAME_LABEL_RESERVE = 32
/** Default rendered separation between neighboring grid frames. */
const GRID_FRAME_GAP = 24
/** List keeps grid rhythm plus the requested extra variant separation. */
const LIST_FRAME_GAP = GRID_FRAME_GAP + 64

/** Canvas identity stays stable when mounted frames change. */
export interface CanvasFrameLayout extends CanvasRect {
  /** Shared row extent keeps visibility binary search valid for unequal sibling heights. */
  rowBottom?: number
  /** Stable key scoped to story and variant. */
  id: string
  /** Collected story identity. */
  storyId: string
  /** Collected variant identity. */
  variantId: string
}

/**
 * Return `previous` when `next` describes identical geometry, otherwise `next`.
 * Keeping array identity stops downstream watchers (visibility, measurement) from
 * rerunning when a recomputation produced the same layout.
 */
export function keepFrameLayouts(previous: CanvasFrameLayout[] | undefined, next: CanvasFrameLayout[]): CanvasFrameLayout[] {
  if (!previous || previous.length !== next.length) return next
  for (let index = 0; index < next.length; index++) {
    const a = previous[index]
    const b = next[index]
    if (a.id !== b.id || a.x !== b.x || a.y !== b.y || a.width !== b.width || a.height !== b.height || a.rowBottom !== b.rowBottom || a.storyId !== b.storyId || a.variantId !== b.variantId) return next
  }
  return previous
}

/** Lay out frames independently of their preview runtime and visibility. */
export function layoutCanvasFrames(storyId: string, variantIds: readonly string[], size: CanvasSize | ((variantId: string) => CanvasSize), arrange: 'grid' | 'list', columns = 3, chromeScale = 1): CanvasFrameLayout[] {
  const list = arrange === 'list'
  const count = list ? 1 : Math.max(1, columns)
  const scale = Math.max(0.1, chromeScale)
  // Frame chrome stays readable at every zoom while previews retain logical dimensions.
  const labelHeight = (list ? CANVAS_FRAME_LABEL_HEIGHT : GRID_FRAME_LABEL_RESERVE) / scale
  const gap = (list ? LIST_FRAME_GAP : GRID_FRAME_GAP) / scale
  const sizes = variantIds.map(id => typeof size === 'function' ? size(id) : size)
  const widths = Array.from({ length: count }, () => 0)
  const heights = Array.from({ length: Math.ceil(variantIds.length / count) }, () => 0)
  sizes.forEach((size, index) => {
    widths[index % count] = Math.max(widths[index % count], size.width)
    heights[Math.floor(index / count)] = Math.max(heights[Math.floor(index / count)], size.height + labelHeight)
  })
  const xs = canvasTrackOffsets(widths, GRID_FRAME_GAP / scale)
  const ys = canvasTrackOffsets(heights, gap)
  return variantIds.map((variantId, index) => ({
    id: getHistoireTargetKey({ storyId, variantId }),
    storyId,
    variantId,
    x: xs[index % count],
    y: ys[Math.floor(index / count)],
    width: sizes[index].width,
    height: sizes[index].height + labelHeight,
    ...(typeof size === 'function' ? { rowBottom: ys[Math.floor(index / count)] + heights[Math.floor(index / count)] } : {}),
  }))
}

/** Accumulate unequal tracks once rather than summing preceding sizes for every cell. */
export function canvasTrackOffsets(sizes: readonly number[], gap: number, start = 0): number[] {
  let offset = start
  return sizes.map((size) => {
    const value = offset
    offset += size + gap
    return value
  })
}

/** Find complete canvas extent without measuring transformed DOM. */
export function canvasFrameBounds(frames: readonly CanvasRect[]): CanvasRect {
  if (!frames.length) return { x: 0, y: 0, width: 0, height: 0 }
  const x = Math.min(...frames.map(frame => frame.x))
  const y = Math.min(...frames.map(frame => frame.y))
  return { x, y, width: Math.max(...frames.map(frame => frame.x + frame.width)) - x, height: Math.max(...frames.map(frame => frame.y + frame.height)) - y }
}

/**
 * Return only intersecting frames; monotonic layout rows let binary search skip distant rows.
 */
export function visibleCanvasFrames(frames: readonly CanvasFrameLayout[], viewport: CanvasRect): CanvasFrameLayout[] {
  if (!frames.length || viewport.width <= 0 || viewport.height <= 0) return []

  const viewportBottom = viewport.y + viewport.height
  let low = 0
  let high = frames.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if ((frames[middle].rowBottom ?? frames[middle].y + frames[middle].height) <= viewport.y) low = middle + 1
    else high = middle
  }
  const start = low

  high = frames.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (frames[middle].y < viewportBottom) low = middle + 1
    else high = middle
  }

  const viewportRight = viewport.x + viewport.width
  return frames.slice(start, low).filter(frame => frame.y + frame.height > viewport.y && frame.x < viewportRight && frame.x + frame.width > viewport.x)
}

/** Calculate a frame's rendered area inside the actual viewport. */
function visibleArea(frame: CanvasRect, viewport: CanvasRect): number {
  const width = Math.max(0, Math.min(frame.x + frame.width, viewport.x + viewport.width) - Math.max(frame.x, viewport.x))
  const height = Math.max(0, Math.min(frame.y + frame.height, viewport.y + viewport.height) - Math.max(frame.y, viewport.y))
  return width * height
}

/** Admit selected frame first, then largest visible frames, never above live budget. */
export function liveCanvasFrames(frames: readonly CanvasFrameLayout[], viewport: CanvasRect, budget: number, selected: string | null, margin = 160): Set<string> {
  const limit = Math.max(1, Math.floor(Number.isFinite(budget) ? budget : 1))
  const selectedFrame = frames.find(frame => frame.id === selected)
  const intersectsMargin = (frame: CanvasRect) => frame.x + frame.width >= viewport.x - margin && frame.x <= viewport.x + viewport.width + margin
    && frame.y + frame.height >= viewport.y - margin && frame.y <= viewport.y + viewport.height + margin
  const candidates = frames
    .map((frame, index) => ({ frame, index, area: visibleArea(frame, viewport) }))
    .filter(candidate => candidate.frame !== selectedFrame && intersectsMargin(candidate.frame))
    // Layout order makes ties deterministic and lets margin-only frames prefetch predictably.
    .sort((first, second) => second.area - first.area || first.index - second.index)
  return new Set([...(selectedFrame ? [selectedFrame] : []), ...candidates.map(candidate => candidate.frame)].slice(0, limit).map(frame => frame.id))
}

/** Order only admitted startup targets by center distance from selected or first admitted anchor. */
export function rankCanvasStartupFrames(frames: readonly CanvasFrameLayout[], admittedFrameIds: readonly string[], selectedFrameId: string | null): string[] {
  const layoutIndex = new Map<string, number>(frames.map((frame, index): [string, number] => [frame.id, index]))
  const byId = new Map<string, CanvasFrameLayout>(frames.map((frame): [string, CanvasFrameLayout] => [frame.id, frame]))
  const admitted = [...new Set(admittedFrameIds)].filter(id => byId.has(id))
  if (!admitted.length) return []

  // Without a selection, admission order already encodes visible-area and layout priority.
  const anchorId = selectedFrameId && admitted.includes(selectedFrameId) ? selectedFrameId : admitted[0]
  const anchor = byId.get(anchorId)!
  const centerX = anchor.x + anchor.width / 2
  const centerY = anchor.y + anchor.height / 2
  const distances = new Map<string, number>(admitted.map((id): [string, number] => {
    const frame = byId.get(id)!
    const dx = frame.x + frame.width / 2 - centerX
    const dy = frame.y + frame.height / 2 - centerY
    return [id, dx * dx + dy * dy]
  }))

  return [anchorId, ...admitted.filter(id => id !== anchorId).sort((first, second) => {
    return distances.get(first)! - distances.get(second)! || layoutIndex.get(first)! - layoutIndex.get(second)!
  })]
}
