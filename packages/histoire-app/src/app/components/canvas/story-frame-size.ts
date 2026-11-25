import type { HistoireCatalogStory } from '@histoire/sdk'
import type { StoryCanvasViews } from '../../stores/story-canvas-views.js'

/** Width and height a story declares in its layout, whether or not they are in use. */
export function declaredFrameSize(story: Pick<HistoireCatalogStory, 'layout'> | undefined): { width?: number, height?: number } | undefined {
  const layout = story?.layout
  if (!layout?.width && !layout?.height) return undefined
  return { width: layout.width, height: layout.height }
}

/** Declared size in use: absent once the story is switched to the toolbar viewport for this session. */
export function storyFrameSize(views: StoryCanvasViews, story: Pick<HistoireCatalogStory, 'id' | 'layout'> | undefined): { width?: number, height?: number } | undefined {
  if (!story || views.usesToolbarViewport(story.id)) return undefined
  return declaredFrameSize(story)
}
