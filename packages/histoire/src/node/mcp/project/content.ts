import type { McpDocsResult, McpSourceResult } from '../protocol/content-schema.js'
import type { McpToolInput } from '../protocol/tool-schema.js'
import type { ProjectCatalog } from './catalog.js'
import { CatalogError } from '../../runtime/catalog/types.js'
import { readDocsContent } from '../../runtime/content/docs.js'
import { readSourceContent } from '../../runtime/content/source.js'
import { McpDomainError } from '../protocol/errors.js'
import { readRegisteredText } from './containment.js'
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

  /** Maps shared domain failures at MCP boundary without leaking private errors. */
  async function read<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation()
    }
    catch (error) {
      if (error instanceof CatalogError) throw new McpDomainError(error.code as any, error.message, error.retryable, error.data)
      throw error
    }
  }

  return {
    /** Returns preferred original docs, validating physical bytes and current revision. */
    async getDocs(input: DocsContentInput): Promise<McpDocsResult> {
      const result = target(input.storyId, input.expectedRevision)
      const docs = await read(() => readDocsContent(options.root, result.entry, readRegisteredText))
      const data = { projectId: result.projectId, revision: result.revision, storyId: input.storyId, kind: docs.kind, origin: docs.origin, ...(docs.filePath ? { filePath: docs.filePath.replace(/\\/g, '/') } : {}), ...pageDocsText(docs.text, input.offset, input.limit) }
      options.catalog.getStory(input.storyId, result.revision)
      requireContentResponseBudget(data)
      return data
    },
    /** Returns exact physical/virtual source pages with full-content hash. */
    async getSource(input: SourceContentInput): Promise<McpSourceResult> {
      const result = target(input.storyId, input.expectedRevision)
      const text = await read(() => readSourceContent(options.root, result.entry.source, readRegisteredText))
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
