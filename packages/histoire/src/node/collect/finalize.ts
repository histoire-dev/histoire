import type { ServerStory, ServerStoryFile } from '@histoire/shared'
import type { Context } from '../context.js'
import { relative } from 'pathe'
import { createPath } from '../tree.js'

export function finalizeCollectedStoryFile(storyFile: ServerStoryFile, ctx: Context, storyData: ServerStory = storyFile.story) {
  if (!storyData) {
    return
  }

  if (ctx.config.defaultStoryProps) {
    for (const key in ctx.config.defaultStoryProps) {
      if (storyData[key] == null) {
        storyData[key] = ctx.config.defaultStoryProps[key]
      }
    }
  }

  if (!storyData.layout) {
    storyData.layout = { type: 'single', iframe: true }
  }
  else if (storyData.layout.type === 'single' && storyData.layout.iframe !== true) {
    storyData.layout = {
      ...storyData.layout,
      iframe: true,
    }
  }

  storyFile.id = storyData.id
  storyFile.story = storyData
  storyFile.treeFile = {
    title: storyData.title,
    path: relative(ctx.root, storyFile.path),
  }
  storyFile.treePath = createPath(ctx.config, storyFile.treeFile)
  storyFile.story.title = storyFile.treePath[storyFile.treePath.length - 1]
}
