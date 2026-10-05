import type { HistoireReadonly, HistoireSnapshot } from '@histoire/protocol'
import type { CanvasFrames } from '../../composables/canvas-settings.js'
import type { CanvasStore } from '../../stores/canvas.js'
import type { McpStore } from '../../stores/mcp.js'
import type { CanvasPoint, CanvasRect } from './pan/usePanZoom.js'
import { getHistoireTargetKey } from '@histoire/protocol'
import { getMeasureOwner } from './measure-owner.js'

/** Current live canvas projection; no operation inputs or runtime internals are retained. */
export interface McpCursorContext {
  /** Public activity state supplied by the nearest dev provider. */
  activity: Pick<McpStore, 'status' | 'follow' | 'current'>
  /** Canonical SDK snapshot owns selected target and readiness. */
  snapshot: HistoireReadonly<HistoireSnapshot>
  /** Local selected frame key, including matrix cells. */
  canvas: CanvasStore
  /** Exact mounted frame/document registry. */
  frames: CanvasFrames
  /** Visible canvas overlay bounds in browser coordinates. */
  bounds: CanvasRect
}

/** Show activity only on its exact ready canonical document, projected from preview CSS pixels. */
export function getMcpCursor({ activity, snapshot, canvas, frames, bounds }: McpCursorContext): CanvasPoint | null {
  const operation = activity.current
  const target = operation?.target
  if (activity.status !== 'enabled' || !activity.follow || operation?.state !== 'running'
    || target?.variantId === undefined || snapshot.selection?.storyId !== target.storyId
    || snapshot.selection.variantId !== target.variantId) {
    return null
  }

  const id = getHistoireTargetKey({ storyId: target.storyId, variantId: target.variantId })
  // Operations carry story/variant tuples only; a matrix cell has extra override identity.
  if (canvas.selectedFrame !== id) return null
  const frame = frames.getFrame(id)
  if (!getMeasureOwner(frame, snapshot, true) || !frame?.iframe?.isConnected
    || !snapshot.catalog.stories.some(story => story.id === target.storyId && story.variants.some(variant => variant.id === target.variantId))
    || !(frame.rect.width > 0 && frame.rect.height > 0 && bounds.width > 0 && bounds.height > 0)) {
    return null
  }

  try {
    if (new URL(frame.iframe.src, frame.iframe.ownerDocument.baseURI).searchParams.get('documentId') !== frame.documentId) return null
  }
  catch { return null }
  const rect = frame.iframe.getBoundingClientRect()
  if (!(rect.width > 0 && rect.height > 0)) return null
  // Default anchor identifies preview content; it stays in CSS pixels under any canvas zoom.
  const point = frames.frameToClient(id, { x: Math.min(16, frame.rect.width / 2), y: Math.min(16, frame.rect.height / 2) })
  if (!point) return null
  const position = { x: point.x - bounds.x, y: point.y - bounds.y }
  return Number.isFinite(position.x) && Number.isFinite(position.y) && position.x >= 0 && position.y >= 0
    && position.x < bounds.width && position.y < bounds.height
    ? position
    : null
}
