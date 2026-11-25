import type { ServerStory, ServerStoryFile } from '@histoire/shared'
import type { Context } from '../context.js'
import type { StoryCollectionOutcome } from './outcome.js'
import { relative } from 'pathe'
import { createPath } from '../tree.js'

/** Normalize layout while retaining whether author/project supplied it. */
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

  // Finalization can repeat; its own fallback must never become an author declaration.
  storyData.layoutExplicit ??= !!storyData.layout?.type

  storyData.layout = { ...storyData.layout, type: storyData.layout?.type ?? 'single' }

  storyFile.id = storyData.id
  storyFile.story = storyData
  storyFile.treeFile = {
    title: storyData.title,
    path: relative(ctx.root, storyFile.path),
  }
  storyFile.treePath = createPath(ctx.config, storyFile.treeFile)
  storyFile.story.title = storyFile.treePath[storyFile.treePath.length - 1]
}

/** Applies a cached collection outcome to a story file, as if it had just been collected. */
export function restoreCollectedStoryFile(storyFile: ServerStoryFile, ctx: Context, outcome: StoryCollectionOutcome | undefined) {
  if (outcome?.status === 'collected' && outcome.story) {
    // Finalization mutates its input; the cached copy must stay raw.
    finalizeCollectedStoryFile(storyFile, ctx, structuredClone(outcome.story))
    return
  }
  delete storyFile.story
  delete storyFile.treePath
  delete storyFile.treeFile
}
