import type { HistoireCatalog, HistoireCatalogStory } from '@histoire/protocol'
import { orderedStories } from '../home/catalog.js'

/** Documents navigate through real tree order, bounded by current logical group. */
export function documentNeighbors(catalog: HistoireCatalog, current: HistoireCatalogStory | undefined): { previous: HistoireCatalogStory | undefined, next: HistoireCatalogStory | undefined } {
  const guides = current ? orderedStories(catalog).filter(story => story.docsOnly && story.group === current.group) : []
  const index = guides.findIndex(story => story.id === current?.id)
  return { previous: index > 0 ? guides[index - 1] : undefined, next: index >= 0 ? guides[index + 1] : undefined }
}
