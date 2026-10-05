import type { HistoireDocsContent, HistoireSourceContent } from '@histoire/protocol'
import type { RuntimeCatalog } from '../catalog/publication.js'
import type { ContentReader } from './types.js'
import { CatalogError } from '../catalog/types.js'
import { readDocsContent } from './docs.js'
import { readSourceContent } from './source.js'

/** Lazy content facade over a completed catalog; transport paging stays in adapters. */
export function createRuntimeContent(options: { root: string, catalog: Pick<RuntimeCatalog, 'current' | 'getStory'>, readText?: ContentReader }) {
  /** Captures publication and exact registered handle before asynchronous filesystem work. */
  function target(storyId: string, expectedRevision?: string) {
    const result = options.catalog.getStory(storyId, expectedRevision)
    const snapshot = options.catalog.current
    const entry = snapshot.contents.get(result.story.filePath)
    if (!entry) throw new CatalogError('SOURCE_UNAVAILABLE', 'Registered story content is unavailable')
    return { ...result, snapshot, entry }
  }
  return {
    /** Returns captured rendered docs or collected text without story execution. */
    async getDocs(storyId: string, expectedRevision?: string): Promise<HistoireDocsContent> {
      const captured = target(storyId, expectedRevision)
      const docs = await readDocsContent(options.root, captured.entry, options.readText)
      options.catalog.getStory(storyId, captured.revision)
      return Object.freeze({ storyId, epoch: captured.snapshot.epoch, revision: captured.revision, ...(docs.filePath ? { relativePath: docs.filePath } : { relativePath: captured.story.filePath }), origin: docs.inline ? 'inline' : docs.origin, format: docs.html == null ? 'text' : 'html', body: docs.html ?? docs.text })
    },
    /** Returns exact original registered raw source with captured generation/revision. */
    async getSource(storyId: string, expectedRevision?: string): Promise<HistoireSourceContent> {
      const captured = target(storyId, expectedRevision)
      const body = await readSourceContent(options.root, captured.entry.source, options.readText)
      options.catalog.getStory(storyId, captured.revision)
      return Object.freeze({ storyId, epoch: captured.snapshot.epoch, revision: captured.revision, relativePath: captured.story.filePath, mode: 'raw', origin: captured.entry.source.kind as 'file' | 'virtual', body })
    },
  }
}

/** Shared Node content service consumed by SDK/source adapters. */
export type RuntimeContent = ReturnType<typeof createRuntimeContent>
