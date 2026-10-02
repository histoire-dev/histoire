import type { ArtifactManifest } from './artifact-schema.js'
import { createCatalogPager } from '../mcp/project/catalog-pages.js'
import { McpDomainError } from '../mcp/protocol/errors.js'

/** Exact immutable target authority; duplicates remain errors rather than picks. */
export function createNodeCatalog(manifest: ArtifactManifest, projectId: string, revision: string) {
  const records = new Map<string, typeof manifest.stories>()
  for (const record of manifest.stories) records.set(record.story.id, [...(records.get(record.story.id) ?? []), record])
  const snapshot = { revision, stories: manifest.stories.map(record => record.story), diagnostics: manifest.diagnostics, diagnosticsTruncated: manifest.diagnosticsTruncated }
  /** Resolve exact ID and completed immutable revision. */
  function getStory(storyId: string, expectedRevision?: string) {
    if (expectedRevision && expectedRevision !== revision) throw new McpDomainError('STALE_REVISION', 'Catalog revision changed', true)
    const matches = records.get(storyId) ?? []
    if (matches.length > 1) throw new McpDomainError('STORY_AMBIGUOUS', 'Story ID is ambiguous', false, { storyId })
    if (!matches.length) throw new McpDomainError('STORY_NOT_FOUND', 'Story not found', false, { storyId })
    return { projectId, revision, story: matches[0].story, record: matches[0] }
  }
  return {
    getStory,
    /** Scoped variant identity requires one exact collected match. */
    getTarget(storyId: string, variantId: string, expectedRevision?: string) {
      const value = getStory(storyId, expectedRevision)
      const variants = value.story.variants.filter(variant => variant.id === variantId)
      if (variants.length > 1) throw new McpDomainError('STORY_AMBIGUOUS', 'Variant ID is ambiguous within story', false, { storyId, variantId })
      if (!variants.length || value.story.docsOnly) throw new McpDomainError('VARIANT_NOT_FOUND', 'Variant not found', false, { storyId, variantId })
      return { ...value, variant: variants[0] }
    },
    /** Uses same page bounds, filters and issued cursors as dev runtime. */
    list: createCatalogPager({ projectId, current: () => snapshot, updating: () => false }),
  }
}

/** Private immutable target lookup accepted by screenshots and compiled tests. */
export type NodeCatalog = ReturnType<typeof createNodeCatalog>
