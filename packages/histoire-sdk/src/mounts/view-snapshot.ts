import type { HistoireCatalog, HistoireReadonly, HistoireSnapshot, HistoireSurface } from '@histoire/protocol'

/** Own latest view metadata projection for one mount; host catalog remains complete. */
export function createMountViewSnapshot(surface: HistoireSurface) {
  const runtimeOnly = surface === 'preview' || surface === 'grid'
  let previousCatalog: HistoireReadonly<HistoireCatalog> | undefined
  let previousStoryId: string | null | undefined
  let projectedCatalog: HistoireReadonly<HistoireCatalog> | undefined

  /** Runtime frames need selected story's complete variant registry, never unrelated navigation. */
  return (snapshot: HistoireReadonly<HistoireSnapshot>): HistoireReadonly<HistoireSnapshot> => {
    const storyId = snapshot.selection?.storyId ?? null
    let catalog = snapshot.catalog
    if (runtimeOnly) {
      // Immutable catalog publication replaces its reference. State/layout ACKs
      // and same-story grid selections reuse this mount's metadata in O(1).
      if (previousCatalog !== catalog || previousStoryId !== storyId) {
        previousCatalog = catalog
        previousStoryId = storyId
        projectedCatalog = { ...catalog, stories: catalog.stories.filter(story => story.id === storyId), tree: [] }
      }
      // Keep all matches so malformed duplicate IDs cannot become valid actors.
      catalog = projectedCatalog!
    }
    return { ...snapshot, catalog, events: { items: [], droppedCount: snapshot.events.droppedCount } }
  }
}
