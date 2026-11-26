import { useHistoireSnapshot } from '@histoire/vue'
import { computed } from 'vue'
import { useCanvasFrames, useCanvasStore } from '../../../composables/canvas-settings.js'
import { isBuiltinCanvasArrangement } from '../../../stores/canvas-arrangement.js'
import { getSelectedCanvasFrame } from '../frame-target.js'
import { declaredFrameSize } from '../story-frame-size.js'
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

/** Selected story and its declared size in arrangements that support From code. */
export function useDeclaredStoryFrame() {
  const canvas = useCanvasStore()
  const snapshot = useHistoireSnapshot()
  return computed(() => {
    if (canvas.arrangement === 'single' || !isBuiltinCanvasArrangement(canvas.arrangement)) return undefined
    const story = snapshot.value.catalog.stories.find(item => item.id === snapshot.value.selection?.storyId)
    const size = declaredFrameSize(story)
    return story && size ? { storyId: story.id, ...size } : undefined
  })
}
