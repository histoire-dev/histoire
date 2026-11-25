import { useHistoireSnapshot } from '@histoire/vue'
import { computed } from 'vue'
import { useCanvasFrames, useCanvasStore } from '../../../composables/canvas-settings.js'
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

/** Selected story and its declared size outside Single, which ignores it and keeps the toolbar viewport. */
export function useDeclaredStoryFrame() {
  const canvas = useCanvasStore()
  const snapshot = useHistoireSnapshot()
  return computed(() => {
    if (canvas.arrangement === 'single') return undefined
    const story = snapshot.value.catalog.stories.find(item => item.id === snapshot.value.selection?.storyId)
    const size = declaredFrameSize(story)
    return story && size ? { storyId: story.id, ...size } : undefined
  })
}

/** Declared size in use for the selected story; absent once switched to the toolbar viewport. */
export function useStoryFrameSize() {
  const canvas = useCanvasStore()
  const declared = useDeclaredStoryFrame()
  return computed(() => declared.value && !canvas.toolbarSizedStories[declared.value.storyId] ? declared.value : undefined)
}
