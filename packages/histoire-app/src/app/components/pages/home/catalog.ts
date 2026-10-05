import type { HistoireCatalog, HistoireCatalogStory, HistoireCatalogTreeNode, HistoireSelectionInput } from '@histoire/protocol'

/** Home card derived from one real top-level navigation node. */
export interface BrowseSection {
  /** Stable node identity within this catalog. */
  id: string
  /** Collected label, with content-based fallback for unnamed default groups. */
  title: string
  /** Number of preview stories in section. */
  stories: number
  /** Number of collected preview variants. */
  variants: number
  /** Number of standalone documentation entries. */
  guides: number
  /** Real initial selection in tree order. */
  target: HistoireSelectionInput
  /** Exact story identities for attributable test status. */
  storyIds: string[]
  /** Real child titles shown in static overview cards. */
  storyTitles: string[]
}

/** Resolve a subtree without array-index references or stale catalog entries. */
function collectNodes(nodes: readonly HistoireCatalogTreeNode[], byId: Map<string, HistoireCatalogStory>): HistoireCatalogStory[] {
  return nodes.flatMap(node => node.kind === 'story' ? byId.has(node.storyId) ? [byId.get(node.storyId)!] : [] : collectNodes(node.children, byId))
}

/** Shared tree-order projection used by guides and same-group Markdown navigation. */
export function orderedStories(catalog: HistoireCatalog): HistoireCatalogStory[] {
  const byId = new Map(catalog.stories.map(story => [story.id, story]))
  const ordered = collectNodes(catalog.tree, byId)
  const seen = new Set<string>()
  // Catalog-only entries remain discoverable while a collected tree settles.
  return [...ordered, ...catalog.stories].filter((story) => {
    if (seen.has(story.id)) return false
    seen.add(story.id)
    return true
  })
}

/** Empty/stale top-level groups never produce misleading browse cards. */
export function browseSections(catalog: HistoireCatalog): BrowseSection[] {
  const byId = new Map(catalog.stories.map(story => [story.id, story]))
  return catalog.tree.flatMap((node, index) => {
    const stories = collectNodes([node], byId)
    if (!stories.length) return []
    const first = stories.find(story => !story.docsOnly) ?? stories[0]
    return [{
      id: `${node.kind}:${'id' in node ? node.id ?? index : index}`,
      title: node.title.trim() ? node.title : stories.every(story => story.docsOnly) ? 'Guides' : 'Stories',
      stories: stories.filter(story => !story.docsOnly).length,
      variants: stories.reduce((count, story) => count + (story.docsOnly ? 0 : story.variants.length), 0),
      guides: stories.filter(story => story.docsOnly).length,
      target: first.docsOnly ? { storyId: first.id, variantId: null } : { storyId: first.id },
      storyIds: stories.map(story => story.id),
      storyTitles: stories.map(story => story.title),
    }]
  })
}
