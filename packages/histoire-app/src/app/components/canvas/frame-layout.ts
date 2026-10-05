import type { CanvasRect, CanvasSize } from './pan/usePanZoom.js'
import { getHistoireTargetKey } from '@histoire/protocol'

/** Canvas identity stays stable when mounted frames change. */
export interface CanvasFrameLayout extends CanvasRect {
  /** Stable key scoped to story and variant. */
  id: string
  /** Collected story identity. */
  storyId: string
  /** Collected variant identity. */
  variantId: string
}

/** Lay out frames independently of their preview runtime and visibility. */
export function layoutCanvasFrames(storyId: string, variantIds: readonly string[], size: CanvasSize, arrange: 'grid' | 'list', columns = 3, chromeScale = 1): CanvasFrameLayout[] {
  const count = arrange === 'list' ? 1 : Math.max(1, columns)
  const scale = Math.max(0.1, chromeScale)
  const labelWidth = arrange === 'list' ? 144 / scale : 0
  const labelHeight = arrange === 'list' ? 0 : 32 / scale
  return variantIds.map((variantId, index) => ({
    id: getHistoireTargetKey({ storyId, variantId }),
    storyId,
    variantId,
    x: (index % count) * (size.width + 24 / scale),
    y: Math.floor(index / count) * (size.height + labelHeight + 24 / scale),
    width: size.width + labelWidth,
    height: size.height + labelHeight,
  }))
}

/** Find complete canvas extent without measuring transformed DOM. */
export function canvasFrameBounds(frames: readonly CanvasRect[]): CanvasRect {
  if (!frames.length) return { x: 0, y: 0, width: 0, height: 0 }
  const x = Math.min(...frames.map(frame => frame.x))
  const y = Math.min(...frames.map(frame => frame.y))
  return { x, y, width: Math.max(...frames.map(frame => frame.x + frame.width)) - x, height: Math.max(...frames.map(frame => frame.y + frame.height)) - y }
}

/** Admit selected frame first, then nearby frames, never above live budget. */
export function liveCanvasFrames(frames: readonly CanvasFrameLayout[], viewport: CanvasRect, budget: number, selected: string | null, margin = 160): Set<string> {
  const limit = Math.max(1, Math.floor(Number.isFinite(budget) ? budget : 1))
  const selectedFrame = frames.find(frame => frame.id === selected)
  const intersects = (frame: CanvasRect) => frame.x + frame.width >= viewport.x - margin && frame.x <= viewport.x + viewport.width + margin
    && frame.y + frame.height >= viewport.y - margin && frame.y <= viewport.y + viewport.height + margin
  const visible = frames.filter(frame => frame !== selectedFrame && intersects(frame))
  const center = { x: viewport.x + viewport.width / 2, y: viewport.y + viewport.height / 2 }
  visible.sort((a, b) => Math.hypot(a.x - center.x, a.y - center.y) - Math.hypot(b.x - center.x, b.y - center.y))
  return new Set([...(selectedFrame ? [selectedFrame] : []), ...visible].slice(0, limit).map(frame => frame.id))
}
