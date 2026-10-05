import type { CanvasFrames } from '../../composables/canvas-settings.js'
import type { FrameActionTarget } from '../../util/frame-actions.js'

/** Resolve exact mounted frame chrome without inferring canonical selection. */
export function getRegisteredFrameTarget(target: EventTarget | null, frames: CanvasFrames): FrameActionTarget | null {
  const element = target as Element | null
  const frameId = element?.closest?.<HTMLElement>('[data-frame-id]')?.dataset.frameId
  const frame = frameId ? frames.getFrame(frameId) : null
  return frame ? { storyId: frame.storyId, variantId: frame.variantId, frameKey: frame.id } : null
}
