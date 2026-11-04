import type { CatalogStateDto, CatalogStoryDto, CatalogVariantDto } from '../protocol/catalog.js'
import type { StoriesView, VariantsView } from './state.js'
import { sanitizeText } from '../output/sanitize.js'
import { fitWidth } from '../width.js'

/** `1 story`, `2 stories`. */
function count(value: number, singular: string, plural: string): string {
  return `${value} ${value === 1 ? singular : plural}`
}

/**
 * Panel segment: whole-catalog counts, hidden until a catalog of the current generation answered.
 * @param catalog Latest catalog state.
 */
export function catalogSegment(catalog: CatalogStateDto | undefined): string | undefined {
  if (!catalog?.revision) return undefined
  return `${count(catalog.stories, 'story', 'stories')}, ${count(catalog.variants, 'variant', 'variants')}${catalog.updating ? ', updating' : ''}`
}

/** Display text safe for a terminal row (authored titles may contain control sequences). */
function show(text: string): string {
  return sanitizeText(text).replace(/\s+/g, ' ')
}

/** Marks the selected row with inverse video. */
function mark(line: string, selected: boolean): string {
  return selected ? `\u001B[7m${line}\u001B[27m` : line
}

/**
 * One story row: title, file label and flags.
 * @param story Story DTO.
 * @param selected Whether the cursor is on it.
 * @param columns Screen width.
 */
export function storyRow(story: CatalogStoryDto, selected: boolean, columns: number): string {
  const flags = [
    story.ambiguous ? 'ID shared' : story.docsOnly ? 'docs' : count(story.variantCount, 'variant', 'variants'),
    ...(story.matchedVariants ? [`${count(story.matchedVariants, 'variant', 'variants')} match`] : []),
  ]
  return mark(fitWidth(`${selected ? '›' : ' '} ${show(story.title)}  \u001B[2m${show(story.filePath)} · ${flags.join(' · ')}\u001B[22m`, columns), selected)
}

/**
 * One variant row.
 * @param variant Variant DTO.
 * @param selected Whether the cursor is on it.
 * @param columns Screen width.
 */
export function variantRow(variant: CatalogVariantDto, selected: boolean, columns: number): string {
  const sameTitle = variant.title === variant.id
  const flags = [...(variant.ambiguous ? ['ID shared'] : []), ...(variant.matched ? ['match'] : [])]
  const detail = [...(sameTitle ? [] : [show(variant.id)]), ...flags]
  return mark(fitWidth(`${selected ? '›' : ' '} ${show(variant.title)}${detail.length ? `  \u001B[2m${detail.join(' · ')}\u001B[22m` : ''}`, columns), selected)
}

/**
 * Status line above the stories list.
 * @param view Stories view.
 */
export function storiesStatus(view: StoriesView): string {
  const parts = [`${view.stories.length} of ${count(view.total, 'story', 'stories')}`]
  if (view.query) parts.push(`filter "${show(view.query)}"`)
  else if (view.catalog && view.catalog.stories !== view.total) parts.push(`${view.catalog.stories} in catalog`)
  if (view.hasMore) parts.push('more load as you scroll')
  if (view.catalog?.updating) parts.push('updating')
  if (view.catalog?.diagnostics) parts.push(count(view.catalog.diagnostics, 'issue', 'issues'))
  return `\u001B[2m${parts.join(' · ')}\u001B[22m`
}

/**
 * Status line above the variants list.
 * @param story Opened story as listed, when it still exists.
 * @param variants Variants view.
 * @param catalogUpdating The catalog is being collected again.
 */
export function variantsStatus(story: CatalogStoryDto | undefined, variants: VariantsView, catalogUpdating: boolean): string {
  const parts = [story ? show(story.title) : 'Story is not in the catalog', `${variants.variants.length} of ${count(variants.total, 'variant', 'variants')}`]
  if (variants.hasMore) parts.push('more load as you scroll')
  if (catalogUpdating) parts.push('updating')
  return `\u001B[2m${parts.join(' · ')}\u001B[22m`
}

/**
 * Text shown instead of rows.
 * @param view Stories view.
 * @param hasSelection A selection by ID exists that the catalog does not confirm.
 */
export function emptyStoriesText(view: StoriesView, hasSelection: boolean): string {
  if (view.status === 'waiting') return hasSelection ? 'Waiting for the runtime; the selection is kept until the catalog confirms it' : 'Waiting for the runtime'
  if (view.status === 'idle' || view.status === 'loading') return 'Loading stories'
  if (view.status === 'failed') return `Catalog unavailable: ${view.problem ?? 'unknown reason'}`
  return view.query ? `No stories match "${show(view.query)}"` : 'No stories'
}
