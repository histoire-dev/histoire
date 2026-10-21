import type { HistoireTarget } from '@histoire/protocol'
import type { CanvasFrames } from '../../composables/canvas-settings.js'
import type { CanvasStore } from '../../stores/canvas.js'
import type { FrameActionTarget } from '../../util/frame-actions.js'
import { getHistoireTargetKey } from '@histoire/protocol'

/** Matrix owns a local cell; Single can have canonical selection before canvas focus exists. */
export function getSelectedCanvasFrame(frames: CanvasFrames, canvas: Pick<CanvasStore, 'selectedFrame' | 'arrangement'>, target?: HistoireTarget | null) {
  const selected = canvas.selectedFrame ? frames.getFrame(canvas.selectedFrame) : null
  if (canvas.arrangement === 'matrix') return selected
  if (selected && (!target || (selected.storyId === target.storyId && selected.variantId === target.variantId))) return selected
  return target?.variantId ? frames.getFrame(getHistoireTargetKey(target)) : null
}

/** Resolve exact mounted frame chrome without inferring canonical selection. */
export function getRegisteredFrameTarget(target: EventTarget | null, frames: CanvasFrames): FrameActionTarget | null {
  const element = target as Element | null
  const frameId = element?.closest?.<HTMLElement>('[data-frame-id]')?.dataset.frameId
  const frame = frameId ? frames.getFrame(frameId) : null
  return frame ? { storyId: frame.storyId, variantId: frame.variantId, frameKey: frame.id } : null
}
