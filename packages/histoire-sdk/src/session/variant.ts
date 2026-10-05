import type { HistoireCatalogStory } from '@histoire/protocol'
import { HistoireSdkError } from '@histoire/protocol'

/** Resolve one story-scoped variant before admitting selection or content work. */
export function assertVariant(story: HistoireCatalogStory, variantId: unknown): asserts variantId is string {
  if (typeof variantId !== 'string') throw new HistoireSdkError('INVALID_ARGUMENT', 'Variant ID must be a string.')
  const matches = story.variants.filter(variant => variant.id === variantId)
  if (matches.length > 1) throw new HistoireSdkError('STORY_AMBIGUOUS', 'Variant ID is ambiguous within story.', { storyId: story.id, variantId })
  if (!matches.length || story.docsOnly) throw new HistoireSdkError('VARIANT_NOT_FOUND', 'Variant ID not found in story.', { storyId: story.id, variantId })
}
