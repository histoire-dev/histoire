import { useHistoireSnapshot } from '@histoire/vue'
import { computed } from 'vue'
import { useCanvasFrames, useCanvasStore } from '../../../composables/canvas-settings.js'
import { getSelectedCanvasFrame } from '../frame-target.js'
import { viewportDimensions } from './settings.js'

/** Toolbar uses physical selection dimensions, including locally selected Matrix cells. */
export function useCanvasViewportDimensions() {
  const canvas = useCanvasStore()
  const frames = useCanvasFrames()
  const snapshot = useHistoireSnapshot()
  return computed(() => {
    if (canvas.autoFitContent) {
      const frame = getSelectedCanvasFrame(frames, canvas, snapshot.value.selection)
      if (frame) return { width: frame.rect.width, height: frame.rect.height }
    }
    if (!canvas.autoFitContent && canvas.arrangement === 'single') return canvas.singleViewportSize
    return viewportDimensions(snapshot.value.settings)
  })
}
