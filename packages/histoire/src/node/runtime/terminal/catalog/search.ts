import type { CatalogStory } from '../../catalog/types.js'

/**
 * Normalizes the search text; an empty result means "no filter".
 * @param query Raw text typed by the user.
 */
export function searchNeedle(query: string | undefined): string {
  return (query ?? '').trim().toLowerCase()
}

/** Whether any of the strings contains the needle (case-insensitive). */
function includes(needle: string, ...texts: string[]): boolean {
  return texts.some(text => text.toLowerCase().includes(needle))
}

/**
 * Whether a variant's ID or title contains the needle.
 * @param variant Variant metadata.
 * @param variant.id Variant ID.
 * @param variant.title Variant title.
 * @param needle Normalized search text.
 */
export function variantMatches(variant: { id: string, title: string }, needle: string): boolean {
  return includes(needle, variant.id, variant.title)
}

/**
 * Whether the story itself (title, ID, file label) contains the needle.
 * @param story Story metadata.
 * @param needle Normalized search text.
 */
export function storyMatches(story: CatalogStory, needle: string): boolean {
  return includes(needle, story.title, story.id, story.filePath)
}

/**
 * Story passes the filter through its own text or any variant text. Runs over the
 * complete canonical catalog, so matches beyond the loaded page are never omitted.
 * @param story Story metadata.
 * @param needle Normalized search text (non-empty).
 */
export function storyOrVariantMatches(story: CatalogStory, needle: string): boolean {
  return storyMatches(story, needle) || story.variants.some(variant => variantMatches(variant, needle))
}
