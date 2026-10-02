import type { Context } from '../context.js'
import { resolve } from 'pathe'
import { readStorySource } from '../story-source.js'

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

/** Builds the existing Source panel module without applying MCP containment policy. */
export async function storySource(ctx: Context, id: string) {
  const storyId = id.slice(RESOLVED_STORY_SOURCE_ID_PREFIX.length)
  const storyFile = ctx.storyFiles.find(f => f.story?.id === storyId)
  if (storyFile) {
    const source = await readStorySource({ ...storyFile, path: resolve(ctx.root, storyFile.relativePath) })
    return `export default ${JSON.stringify(source)}`
  }
}
