import type { ServerStoryFile } from '@histoire/shared'
import type { Context } from '../../context.js'
import type { ContentReader, DocsContentEntry, SourceContentEntry, StoryContentEntry } from './types.js'
import { Buffer } from 'node:buffer'
import matter from 'gray-matter'
import { CatalogContentChangedError, MAX_CONTENT_BYTES, readRegisteredText, RegisteredContentError } from './files.js'
import { hashContent } from './hash.js'
import { getInlineDocs } from './inline.js'

export { CatalogContentChangedError, isPathWithinRoot, MAX_CONTENT_BYTES, readRegisteredText } from './files.js'
export type { ContentIdentity } from './files.js'
export { hashContent } from './hash.js'

/** Captures source/docs availability without storing every physical source in memory. */
export async function indexStoryContent(root: string, file: ServerStoryFile, options: { readText?: ContentReader, context?: Context } = {}): Promise<StoryContentEntry> {
  const readText = options.readText ?? ((_root: string, path: string) => readRegisteredText(undefined, path))
  let source: SourceContentEntry
  if (file.virtual) {
    const text = file.moduleCode
    source = text == null
      ? { kind: 'unavailable', reason: 'Virtual source is unavailable' }
      : Buffer.byteLength(text) <= MAX_CONTENT_BYTES
        ? { kind: 'virtual', text, sha256: hashContent(text) }
        : { kind: 'unavailable', reason: 'Virtual source exceeds file limit' }
  }
  else {
    try {
      const captured = await readText(root, file.path)
      source = { kind: 'file', absolutePath: captured.identity.absolutePath, registeredPath: file.path, sha256: captured.sha256, identity: captured.identity }
    }
    catch (error) {
      if (error instanceof CatalogContentChangedError) throw error
      source = { kind: 'unavailable', reason: error instanceof Error ? error.message : String(error), unavailableCode: error instanceof RegisteredContentError ? error.code : 'SOURCE_UNAVAILABLE' }
    }
  }
  let docs: DocsContentEntry
  let docsUnavailableReason: string
  let docsUnavailableCode: StoryContentEntry['docsUnavailableCode']
  if (file.markdownFile) {
    const markdown = file.markdownFile
    try {
      const captured = await readText(root, markdown.absolutePath)
      const parsed = matter(captured.text)
      // Frontmatter changes may change standalone IDs/titles even when docs
      // body stays identical. Wait for parser/collector to catch up together.
      if (parsed.content !== (markdown.content ?? '') || JSON.stringify(parsed.data) !== JSON.stringify(markdown.frontmatter ?? {})) throw new CatalogContentChangedError('Markdown changed before completed catalog publication')
      const text = parsed.content
      docs = { kind: 'markdown', origin: markdown.isRelatedToStory ? 'sibling' : 'standalone', filePath: markdown.relativePath, absolutePath: captured.identity.absolutePath, registeredPath: markdown.absolutePath, physicalSha256: captured.sha256, text, sha256: hashContent(text), ...(markdown.html == null ? {} : { html: markdown.html }) }
    }
    catch (error) {
      if (error instanceof CatalogContentChangedError) throw error
      docsUnavailableReason = error instanceof Error ? error.message : String(error)
      docsUnavailableCode = error instanceof RegisteredContentError ? error.code : 'SOURCE_UNAVAILABLE'
    }
  }
  else if (options.context && getInlineDocs(options.context, file.path, source.sha256)) {
    const inline = getInlineDocs(options.context, file.path, source.sha256)
    const text = file.story?.docsText ?? inline.text
    docs = { kind: 'text', origin: 'collected', text, html: inline.html, inline: true, sha256: hashContent(text + inline.html) }
  }
  else if (file.story?.docsText != null) {
    const text = file.story.docsText
    if (Buffer.byteLength(text) <= MAX_CONTENT_BYTES) {
      docs = { kind: 'text', origin: 'collected', text, sha256: hashContent(text) }
    }
    else {
      docsUnavailableReason = 'Collected documentation exceeds content limit'
      docsUnavailableCode = 'SOURCE_UNAVAILABLE'
    }
  }
  return { source, docs, docsUnavailableReason, docsUnavailableCode }
}
