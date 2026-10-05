import type { HistoireDocsContent, HistoireSourceAssets, HistoireSourceContent } from '@histoire/protocol'
import type { CatalogSnapshot } from '../../runtime/catalog/types.js'
import { hashContent } from '../../runtime/content/hash.js'

/** Names an opaque immutable content reference without publishing registered file paths. */
function reference(storyId: string, kind: 'docs' | 'source', digest: string, label: string, namespace: 'embed' | 'local'): string {
  return `assets/histoire-${namespace}-${kind}-${hashContent(JSON.stringify([storyId, digest, label]))}.json`
}

/** Projects registered availability into a bounded, exact-target lazy asset inventory. */
export function projectEmbedAssets(snapshot: CatalogSnapshot, namespace: 'embed' | 'local' = 'embed'): HistoireSourceAssets {
  const counts = new Map<string, number>()
  for (const story of snapshot.stories) counts.set(story.id, (counts.get(story.id) ?? 0) + 1)
  return {
    search: `assets/histoire-${namespace}-search-${snapshot.fingerprint}.json`,
    content: snapshot.stories.filter(story => counts.get(story.id) === 1).map((story) => {
      const entry = snapshot.contents.get(story.filePath)
      return {
        storyId: story.id,
        // Rendered HTML/provenance can change with unchanged Markdown text.
        // Every published asset reference identifies its complete portable body.
        ...(entry?.docs ? { docs: reference(story.id, 'docs', hashContent(JSON.stringify([entry.docs.sha256, entry.docs.html, entry.docs.origin, entry.docs.inline])), entry.docs.filePath ?? story.filePath, namespace) } : {}),
        ...(entry?.source.sha256 ? { rawSource: reference(story.id, 'source', hashContent(JSON.stringify([entry.source.sha256, entry.source.kind])), story.filePath, namespace) } : {}),
      }
    }),
  }
}

/** Emitted bodies omit build identity so immutable asset hashes cannot refer to themselves. */
export function projectEmbedContent(content: HistoireDocsContent | HistoireSourceContent) {
  const { epoch: _epoch, revision: _revision, ...body } = content
  return body
}
