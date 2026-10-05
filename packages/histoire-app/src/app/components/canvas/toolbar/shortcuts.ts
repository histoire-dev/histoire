import type { CanvasFrames } from '../../../composables/canvas-settings.js'
import type { CanvasStore } from '../../../stores/canvas.js'
import type { createShortcutRegistry } from '../../../util/shortcuts.js'
import { canMeasureFrame } from '../measure-owner.js'

/** Bind live canvas actions against canonical registry metadata; cleanup retires captured store. */
export function registerCanvasShortcuts(shortcuts: ReturnType<typeof createShortcutRegistry>, canvas: CanvasStore, frames: CanvasFrames): () => void {
  const dispose = [
    shortcuts.bind('canvas.select', () => canvas.setTool('select')),
    shortcuts.bind('canvas.pan', () => canvas.setTool('pan')),
    shortcuts.bind('canvas.measure', () => canvas.setTool('measure'), { enabled: () => canMeasureFrame(canvas.selectedFrame ? frames.getFrame(canvas.selectedFrame) : null) }),
    shortcuts.bind('canvas.fit', () => canvas.fit()),
    shortcuts.bind('canvas.actual', () => canvas.setZoom(1)),
    shortcuts.bind('canvas.selection', () => {
      const frame = canvas.selectedFrame ? frames.getFrame(canvas.selectedFrame) : null
      if (frame) canvas.zoomToFrame(frame.rect)
    }),
  ]
  return () => dispose.forEach(remove => remove())
}
