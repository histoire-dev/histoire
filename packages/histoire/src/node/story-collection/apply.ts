import type { ServerStoryFile } from '@histoire/shared'
import type { Context } from '../context.js'
import type { BrowserCollectedStoryResult, CollectedStoryFile, CollectStoriesBrowserOptions } from './types.js'
import pc from 'picocolors'
import { finalizeCollectedStoryFile } from '../collect/finalize.js'

/**
 * Finalizes the stories collected in the browser. Mirrors the legacy node
 * collection diagnostics: warns (and skips) when a file registered no story,
 * and warns when it registered more than one (only the first is used).
 *
 * Exported for unit testing of the empty/multiple-result edge cases.
 * @param ctx The histoire context.
 * @param results Collection results keyed by story relative path.
 * @param options Finalization options.
 * @param options.storyFiles Story files to finalize, defaults to the whole context.
 * @param options.applyToContext Writes the collected data back onto the live
 * story file objects. Disable to leave the context untouched (see
 * {@link CollectStoriesBrowserOptions.applyToContext}).
 * @returns The finalized story files and whether each registered tests.
 */
export function applyCollectedStories(ctx: Context, results: Map<string, BrowserCollectedStoryResult>, options: {
  storyFiles?: Context['storyFiles']
  applyToContext?: boolean
} = {}): CollectedStoryFile[] {
  const { storyFiles = ctx.storyFiles, applyToContext = true } = options
  const collectedFiles: CollectedStoryFile[] = []

  for (const storyFile of storyFiles) {
    const collected = results.get(storyFile.relativePath)
    if (!collected) continue

    // No story registered: warn and skip so we don't overwrite the existing
    // story with `undefined` and silently lose the file (legacy node parity).
    if (!collected.storyData.length) {
      console.warn(pc.yellow(`⚠️  No story found for ${storyFile.relativePath}. Did you forget to export a story?`))
      continue
    }

    // Multiple stories registered: legacy only supports the first one.
    if (collected.storyData.length > 1) {
      console.warn(pc.yellow(`⚠️  Multiple stories not supported: ${storyFile.relativePath}. Only the first one is used.`))
    }

    const draft: ServerStoryFile = {
      ...storyFile,
      story: collected.storyData[0],
    }

    finalizeCollectedStoryFile(draft, ctx)
    if (applyToContext) {
      Object.assign(storyFile, draft)
    }

    collectedFiles.push({
      storyFile: applyToContext ? storyFile : draft,
      hasTests: collected.hasTests ?? false,
    })
  }

  return collectedFiles
}
