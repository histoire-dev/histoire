import type { HistoireCatalogStory, HistoireSourceSearchData } from '@histoire/protocol'
import { convertTitleToSentence } from '../../search.js'

/** Shared corpus reproduces unrelated screenshot hits and a docs-only Introduction. */
export function createSearchFixture() {
  const stories: HistoireCatalogStory[] = ['EventButton', 'Style Isolation', 'EventButtonGrid', 'Color Button', 'Controls overlays', 'StateOption', 'Introduction'].map((title, index) => ({
    id: `search-${index}`,
    title,
    path: [title],
    docsOnly: title === 'Introduction',
    variants: [{ id: 'default', title: 'default' }],
    content: { docs: title === 'Introduction', rawSource: true },
  }))
  const document = stories.at(-1)!
  const data: HistoireSourceSearchData = {
    titles: stories.flatMap(story => [
      { target: { storyId: story.id, variantId: null }, kind: story.docsOnly ? 'docs' as const : 'story' as const, title: story.title, text: convertTitleToSentence(story.title) },
      ...story.docsOnly ? [] : story.variants.map(variant => ({ target: { storyId: story.id, variantId: variant.id }, kind: 'variant' as const, title: variant.title, text: convertTitleToSentence(`${story.title} ${variant.title}`) })),
    ]),
    docs: [{ target: { storyId: document.id, variantId: null }, kind: 'docs', title: document.title, text: 'Welcome. This is a demo book using Vue 3. Introduction to Histoire.' }],
  }
  return { stories, data, document }
}
