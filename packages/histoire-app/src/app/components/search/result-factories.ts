import type { SearchResult, SearchResultType, Story, Variant } from '../../types'

/** Creates a story navigation result, preserving Docs search activation. */
export function storyResultFactory(story: Story, rank: number, type: SearchResultType = 'title'): SearchResult {
  return {
    kind: 'story',
    rank,
    id: `story:${story.id}`,
    title: story.title,
    route: {
      name: 'story',
      params: {
        storyId: story.id,
      },
      query: {
        ...type === 'docs'
          ? { tab: 'docs' }
          : {},
      },
    },
    path: story.file.path.slice(0, -1),
    icon: story.icon,
    iconColor: story.iconColor,
  }
}

/** Creates an exact variant result without losing its story navigation context. */
export function variantResultFactory(story: Story, variant: Variant, rank: number, type: SearchResultType = 'title'): SearchResult {
  return {
    kind: 'variant',
    rank,
    id: `variant:${story.id}:${variant.id}`,
    title: variant.title,
    route: {
      name: 'story',
      params: {
        storyId: story.id,
      },
      query: {
        variantId: variant.id,
        ...type === 'docs'
          ? { tab: 'docs' }
          : {},
      },
    },
    path: [...story.file.path ?? [], story.title],
    icon: variant.icon,
    iconColor: variant.iconColor,
  }
}
