import type { Context } from '../context.js'
import fs from 'fs-extra'
import { resolve } from 'pathe'

/** Virtual id of a story's own source, imported by the Source panel. */
export const STORY_SOURCE_ID_PREFIX = 'virtual:story-source:'
/** Resolved form of {@link STORY_SOURCE_ID_PREFIX}. */
export const RESOLVED_STORY_SOURCE_ID_PREFIX = `/__resolved__${STORY_SOURCE_ID_PREFIX}`

/**
 * Builds the resolved virtual id carrying the source of one story.
 * @param storyId Id of the story.
 */
export function getResolvedStorySourceId(storyId: string) {
  return `${RESOLVED_STORY_SOURCE_ID_PREFIX}${storyId}`
}

export async function storySource(ctx: Context, id: string) {
  const storyId = id.slice(RESOLVED_STORY_SOURCE_ID_PREFIX.length)
  const storyFile = ctx.storyFiles.find(f => f.story?.id === storyId)
  if (storyFile) {
    let source: string
    if (storyFile.virtual) {
      source = storyFile.moduleCode
    }
    else {
      source = await fs.readFile(resolve(ctx.root, storyFile.relativePath), 'utf-8')
    }
    return `export default ${JSON.stringify(source)}`
  }
}
