import type { HistoireCatalogStory } from '@histoire/sdk'
import type { CanvasStore } from '../../stores/canvas.js'

/** Width and height a story declares in its layout, whether or not they are in use. */
export function declaredFrameSize(story: Pick<HistoireCatalogStory, 'layout'> | undefined): { width?: number, height?: number } | undefined {
  const layout = story?.layout
  if (!layout?.width && !layout?.height) return undefined
  return { width: layout.width, height: layout.height }
}

/** Declared size in use: absent once the story is switched to the toolbar viewport for this session. */
export function storyFrameSize(canvas: CanvasStore, story: Pick<HistoireCatalogStory, 'id' | 'layout'> | undefined): { width?: number, height?: number } | undefined {
  if (!story || canvas.toolbarSizedStories[story.id]) return undefined
  return declaredFrameSize(story)
}
