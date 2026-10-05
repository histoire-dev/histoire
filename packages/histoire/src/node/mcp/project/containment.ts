import { readRegisteredText as readText } from '../../runtime/content/files.js'

export { CatalogContentChangedError, isPathWithinRoot, MAX_CONTENT_BYTES, RegisteredContentError } from '../../runtime/content/files.js'
export type { ContentIdentity, RegisteredText } from '../../runtime/content/files.js'

/** MCP access policy restricts registered reads to canonical project root. */
export function readRegisteredText(root: string, file: string) {
  return readText(root, file)
}
