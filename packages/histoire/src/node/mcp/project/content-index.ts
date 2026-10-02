import type { ServerStoryFile } from '@histoire/shared'
import type { ContentIdentity } from './containment.js'
import { Buffer } from 'node:buffer'
import matter from 'gray-matter'
import { CatalogContentChangedError, MAX_CONTENT_BYTES, readRegisteredText, RegisteredContentError } from './containment.js'
import { hashContent } from './content-hash.js'

export { CatalogContentChangedError, isPathWithinRoot, MAX_CONTENT_BYTES, readRegisteredText } from './containment.js'
export type { ContentIdentity } from './containment.js'
export { hashContent } from './content-hash.js'

/** Private source handle; only virtual modules retain full source text. */
export interface SourceContentEntry {
  /** Registered source kind, never an arbitrary caller path. */
  kind: 'file' | 'virtual' | 'unavailable'
  /** Canonical physical path, excluded from public DTOs. */
  absolutePath?: string
  /** Original registered path retained to detect changed symlink aliases. */
  registeredPath?: string
  /** Captured virtual source bytes. */
  text?: string
  /** SHA-256 of full UTF-8 source. */
  sha256?: string
  /** Canonical read identity for later freshness checks. */
  identity?: ContentIdentity
  /** Bounded reason for unavailable source. */
  reason?: string
  /** Safe unavailable category kept separately from private explanations. */
  unavailableCode?: 'PATH_OUTSIDE_ROOT' | 'SOURCE_UNAVAILABLE'
}

/** Plain-text docs projected from existing collection/Markdown parsing. */
export interface DocsContentEntry {
  /** Markdown files preserve Markdown; inline collected docs are plain text. */
  kind: 'markdown' | 'text'
  /** Existing precedence used by UI documentation. */
  origin: 'sibling' | 'standalone' | 'collected'
  /** Registered project-relative Markdown path. */
  filePath?: string
  /** Physical Markdown path, excluded from public DTOs. */
  absolutePath?: string
  /** Original registered path retained to detect changed symlink aliases. */
  registeredPath?: string
  /** Raw physical hash detects edits even before watcher publication. */
  physicalSha256?: string
  /** Captured documentation content without frontmatter or HTML. */
  text: string
  /** SHA-256 of returned full documentation text. */
  sha256: string
}

/** Private content handles belonging to one immutable catalog entry. */
export interface StoryContentEntry {
  /** Raw source handle. */
  source: SourceContentEntry
  /** Preferred documentation, when present. */
  docs?: DocsContentEntry
  /** Private explanation when existing docs cannot safely be read. */
  docsUnavailableReason?: string
  /** Safe unavailable category kept separately from private explanations. */
  docsUnavailableCode?: 'PATH_OUTSIDE_ROOT' | 'SOURCE_UNAVAILABLE'
}

/** Captures source/docs availability without storing every physical source in memory. */
export async function indexStoryContent(root: string, file: ServerStoryFile): Promise<StoryContentEntry> {
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
      const captured = await readRegisteredText(root, file.path)
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
      const captured = await readRegisteredText(root, markdown.absolutePath)
      const parsed = matter(captured.text)
      // Frontmatter changes may change standalone IDs/titles even when docs
      // body stays identical. Wait for parser/collector to catch up together.
      if (parsed.content !== (markdown.content ?? '') || JSON.stringify(parsed.data) !== JSON.stringify(markdown.frontmatter ?? {})) throw new CatalogContentChangedError('Markdown changed before completed catalog publication')
      const text = parsed.content
      docs = { kind: 'markdown', origin: markdown.isRelatedToStory ? 'sibling' : 'standalone', filePath: markdown.relativePath, absolutePath: captured.identity.absolutePath, registeredPath: markdown.absolutePath, physicalSha256: captured.sha256, text, sha256: hashContent(text) }
    }
    catch (error) {
      if (error instanceof CatalogContentChangedError) throw error
      docsUnavailableReason = error instanceof Error ? error.message : String(error)
      docsUnavailableCode = error instanceof RegisteredContentError ? error.code : 'SOURCE_UNAVAILABLE'
    }
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
