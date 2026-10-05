import type { ServerStoryFile } from '@histoire/shared'
import { indexStoryContent as indexContent } from '../../runtime/content/index.js'
import { readRegisteredText } from './containment.js'

export { hashContent } from '../../runtime/content/hash.js'
export type { DocsContentEntry, SourceContentEntry, StoryContentEntry } from '../../runtime/content/types.js'
export { CatalogContentChangedError, isPathWithinRoot, MAX_CONTENT_BYTES, readRegisteredText } from './containment.js'
export type { ContentIdentity } from './containment.js'

/** Compatibility entry applies MCP containment to canonical content indexing. */
export function indexStoryContent(root: string, file: ServerStoryFile) {
  return indexContent(root, file, { readText: readRegisteredText })
}
