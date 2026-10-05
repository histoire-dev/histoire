import type { HistoireSourceSearchData } from '@histoire/protocol'
import type { CatalogSnapshot } from '../../runtime/catalog/types.js'
import { convertTitleToSentence } from '../../search.js'

/** Reuses completed docs inventory and standalone title normalization without loaders. */
export function projectEmbedSearch(snapshot: CatalogSnapshot): HistoireSourceSearchData {
  const titles: HistoireSourceSearchData['titles'][number][] = []
  const docs: HistoireSourceSearchData['docs'][number][] = []
  for (const story of snapshot.stories) {
    titles.push({ target: { storyId: story.id, variantId: null }, kind: 'story', title: story.title, text: convertTitleToSentence(story.title) })
    for (const variant of story.variants) titles.push({ target: { storyId: story.id, variantId: variant.id }, kind: 'variant', title: variant.title, text: convertTitleToSentence(`${story.title} ${variant.title}`) })
    const content = snapshot.contents.get(story.filePath)?.docs
    if (content) docs.push({ target: { storyId: story.id, variantId: null }, kind: 'docs', title: story.title, text: content.text })
  }
  return { titles, docs }
}
