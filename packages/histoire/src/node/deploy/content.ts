import type { DocsContentInput, SourceContentInput } from '../mcp/project/content.js'
import type { NodeArtifact } from './artifact-reader.js'
import type { NodeCatalog } from './catalog.js'
import { pageSourceText } from '../mcp/project/source-pages.js'
import { pageDocsText, requireContentResponseBudget } from '../mcp/project/text-pages.js'
import { McpDomainError } from '../mcp/protocol/errors.js'

/** Read immutable registered refs; output metadata paths are never filesystem inputs. */
export function createNodeContent(artifact: NodeArtifact, catalog: NodeCatalog) {
  return {
    /** Original documentation text preserves exact UTF-8 content and paging. */
    async getDocs(input: DocsContentInput) {
      const { projectId, revision, record } = catalog.getStory(input.storyId, input.expectedRevision)
      if (!record.docs) throw new McpDomainError('DOCS_NOT_FOUND', 'Story documentation is unavailable')
      const docs = record.docs
      const data = { projectId, revision, storyId: input.storyId, kind: docs.kind, origin: docs.origin, ...(docs.filePath ? { filePath: docs.filePath } : {}), ...pageDocsText(await artifact.readContent(docs), input.offset, input.limit) }
      requireContentResponseBudget(data)
      return data
    },
    /** Source can be omitted by build policy without affecting public Source panel. */
    async getSource(input: SourceContentInput) {
      const { projectId, revision, story, record } = catalog.getStory(input.storyId, input.expectedRevision)
      if (record.source.kind === 'unavailable') throw new McpDomainError('SOURCE_UNAVAILABLE', 'Source is unavailable in this artifact')
      const data = { projectId, revision, storyId: input.storyId, kind: record.source.kind, filePath: story.filePath, ...pageSourceText(await artifact.readContent(record.source), input.startLine, input.lineCount) }
      requireContentResponseBudget(data)
      return data
    },
  }
}
