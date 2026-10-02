import type { McpDocsResult, McpSourceResult } from '../protocol/content-schema.js'
import type { McpToolInput } from '../protocol/tool-schema.js'
import type { ProjectCatalog } from './catalog.js'
import type { StoryContentEntry } from './content-index.js'
import { readStorySource } from '../../story-source.js'
import { McpDomainError } from '../protocol/errors.js'
import { CatalogContentChangedError, readRegisteredText, RegisteredContentError } from './containment.js'
import { hashContent } from './content-hash.js'
import { pageSourceText } from './source-pages.js'
import { pageDocsText, requireContentResponseBudget } from './text-pages.js'

/** Content-only catalog boundary, also usable by immutable deployed catalogs. */
export type ContentCatalog = Pick<ProjectCatalog, 'current' | 'getStory'>
/** Optional paging defaults are supplied by the service as well as wire schemas. */
export type DocsContentInput = Pick<McpToolInput<'histoire_get_docs'>, 'storyId' | 'expectedRevision'> & Partial<Pick<McpToolInput<'histoire_get_docs'>, 'offset' | 'limit'>>
/** Source target remains a catalog ID, never a caller-supplied path. */
export type SourceContentInput = Pick<McpToolInput<'histoire_get_source'>, 'storyId' | 'expectedRevision'> & Partial<Pick<McpToolInput<'histoire_get_source'>, 'startLine' | 'lineCount'>>

/** Private project boundary shared by content tools and resources. */
export interface ProjectContentOptions {
  /** Trusted project root; canonical containment is validated per physical read. */
  root: string
  /** Completed catalog metadata and registered content handles. */
  catalog: ContentCatalog
}

/** Creates one shared content service for tools and resource reads. */
export function createProjectContent(options: ProjectContentOptions) {
  /** Resolves only completed catalog targets before any filesystem access. */
  function target(storyId: string, expectedRevision?: string) {
    const result = options.catalog.getStory(storyId, expectedRevision)
    const entry = options.catalog.current.contents.get(result.story.filePath)
    if (!entry) throw new McpDomainError('SOURCE_UNAVAILABLE', 'Registered story content is unavailable')
    return { ...result, entry }
  }

  /** Maps safe reader categories while preserving stale-file races distinctly. */
  async function readCurrentFile(path: string, expectedPath: string, sha256: string) {
    try {
      const current = await readRegisteredText(options.root, path)
      if (current.sha256 !== sha256 || current.identity.absolutePath !== expectedPath) {
        throw new McpDomainError('STALE_REVISION', 'Registered content changed since catalog publication', true)
      }
      return current.text
    }
    catch (error) {
      if (error instanceof McpDomainError) throw error
      if (error instanceof CatalogContentChangedError) throw new McpDomainError('STALE_REVISION', 'Registered content changed during read', true)
      if (error instanceof RegisteredContentError) {
        if (error.code === 'PATH_OUTSIDE_ROOT') throw new McpDomainError(error.code, error.message)
        // This target was readable at publication. Removal, invalid encoding,
        // growth or changed permissions now invalidate that captured revision.
        throw new McpDomainError('STALE_REVISION', 'Registered content is unavailable since catalog publication', true)
      }
      throw new McpDomainError('SOURCE_UNAVAILABLE', 'Registered content cannot be read')
    }
  }

  /** Reads raw source through the same physical/virtual selection as Source panel. */
  async function sourceText(entry: StoryContentEntry) {
    const source = entry.source
    if (source.kind === 'unavailable') throw new McpDomainError(source.unavailableCode ?? 'SOURCE_UNAVAILABLE', 'Registered source is unavailable')
    const text = await readStorySource({ virtual: source.kind === 'virtual', moduleCode: source.text, path: source.registeredPath ?? source.absolutePath }, path => readCurrentFile(path, source.absolutePath, source.sha256))
    if (text == null || hashContent(text) !== source.sha256) throw new McpDomainError('STALE_REVISION', 'Registered source changed since catalog publication', true)
    return text
  }

  return {
    /** Returns preferred original docs, validating physical bytes and current revision. */
    async getDocs(input: DocsContentInput): Promise<McpDocsResult> {
      const result = target(input.storyId, input.expectedRevision)
      const docs = result.entry.docs
      if (!docs) {
        if (result.entry.docsUnavailableCode === 'PATH_OUTSIDE_ROOT') throw new McpDomainError('PATH_OUTSIDE_ROOT', 'Registered documentation is outside project root')
        throw new McpDomainError('DOCS_NOT_FOUND', 'Story documentation is unavailable')
      }
      if (docs.absolutePath) await readCurrentFile(docs.registeredPath ?? docs.absolutePath, docs.absolutePath, docs.physicalSha256)
      // Collected inline docs belong to the captured source generation. A file
      // edit before collection completes must not serve old inline docs as fresh.
      else if (docs.origin === 'collected' && result.entry.source.kind === 'file') await sourceText(result.entry)
      const data = { projectId: result.projectId, revision: result.revision, storyId: input.storyId, kind: docs.kind, origin: docs.origin, ...(docs.filePath ? { filePath: docs.filePath.replace(/\\/g, '/') } : {}), ...pageDocsText(docs.text, input.offset, input.limit) }
      options.catalog.getStory(input.storyId, result.revision)
      requireContentResponseBudget(data)
      return data
    },
    /** Returns exact physical/virtual source pages with full-content hash. */
    async getSource(input: SourceContentInput): Promise<McpSourceResult> {
      const result = target(input.storyId, input.expectedRevision)
      const text = await sourceText(result.entry)
      const kind = result.entry.source.kind as 'file' | 'virtual'
      const data = { projectId: result.projectId, revision: result.revision, storyId: input.storyId, kind, filePath: result.story.filePath, ...pageSourceText(text, input.startLine, input.lineCount) }
      options.catalog.getStory(input.storyId, result.revision)
      requireContentResponseBudget(data)
      return data
    },
  }
}

/** Shared content facade consumed by SDK registration. */
export type ProjectContent = ReturnType<typeof createProjectContent>
