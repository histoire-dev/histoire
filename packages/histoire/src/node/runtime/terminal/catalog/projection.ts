import type { CatalogStoryDto, CatalogVariantDto } from '@histoire/cli/protocol/catalog'
import type { CatalogSnapshot, CatalogStory } from '../../catalog/types.js'
import { CATALOG_TEXT_MAX } from '@histoire/cli/protocol/catalog'
import { truncateText } from '@histoire/cli/protocol/core'
import { variantMatches } from './search.js'

/**
 * Bounds display text with a visible ellipsis. IDs are never passed through here:
 * an ID that does not survive exactly cannot identify a target.
 * @param text Title or file label.
 */
export function boundDisplayText(text: string): string {
  const { text: kept, truncated } = truncateText(text, CATALOG_TEXT_MAX)
  return truncated ? `${kept}…` : kept
}

/** Story IDs per snapshot that occur more than once; computed once per immutable snapshot. */
const ambiguousIds = new WeakMap<CatalogSnapshot, ReadonlySet<string>>()

/**
 * Story IDs shared by several stories in the snapshot. `lookupStory` refuses such IDs,
 * so the terminal must not offer them as actionable targets either.
 * @param snapshot Completed catalog.
 */
export function ambiguousStoryIds(snapshot: CatalogSnapshot): ReadonlySet<string> {
  let ids = ambiguousIds.get(snapshot)
  if (!ids) {
    const seen = new Set<string>()
    ids = new Set<string>()
    for (const story of snapshot.stories) {
      if (seen.has(story.id)) (ids as Set<string>).add(story.id)
      seen.add(story.id)
    }
    ambiguousIds.set(snapshot, ids)
  }
  return ids
}

/**
 * Projects one story to its display DTO: no source, content or absolute path.
 * @param story Canonical metadata.
 * @param ambiguous Story IDs shared by several stories.
 * @param needle Normalized search text, empty when not searching.
 */
export function projectStory(story: CatalogStory, ambiguous: ReadonlySet<string>, needle: string): CatalogStoryDto {
  return {
    id: story.id,
    title: boundDisplayText(story.title),
    filePath: boundDisplayText(story.filePath),
    docsOnly: story.docsOnly,
    variantCount: story.variants.length,
    ...(ambiguous.has(story.id) ? { ambiguous: true as const } : {}),
    ...(needle ? { matchedVariants: story.variants.filter(variant => variantMatches(variant, needle)).length } : {}),
  }
}

/**
 * Creates the variant projector of a story; flags IDs repeated inside the story.
 * Counting happens once per read, projection per returned variant only.
 * @param story Canonical metadata.
 * @param needle Normalized search text, empty when not searching.
 */
export function createVariantProjector(story: CatalogStory, needle: string): (variant: CatalogStory['variants'][number]) => CatalogVariantDto {
  const counts = new Map<string, number>()
  for (const variant of story.variants) counts.set(variant.id, (counts.get(variant.id) ?? 0) + 1)
  return variant => ({
    id: variant.id,
    title: boundDisplayText(variant.title),
    ...(counts.get(variant.id)! > 1 ? { ambiguous: true as const } : {}),
    ...(needle && variantMatches(variant, needle) ? { matched: true as const } : {}),
  })
}
