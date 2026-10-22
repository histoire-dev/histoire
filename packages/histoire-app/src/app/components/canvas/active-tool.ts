import type { CanvasStore, CanvasTool } from '../../stores/canvas.js'

/**
 * Tool actually applied to pointer input. Single view has no free camera, so a
 * saved Pan preference acts as Select there while staying stored for other views.
 */
export function getActiveCanvasTool(canvas: Pick<CanvasStore, 'tool' | 'arrangement'>): CanvasTool {
  return canvas.tool === 'pan' && canvas.arrangement === 'single' ? 'select' : canvas.tool
}
