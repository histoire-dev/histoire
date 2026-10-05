import type { HistoireCatalog } from '@histoire/protocol'

/** Public story/variant identity shared by activity and saved artifacts. */
interface CatalogTarget {
  /** Exact story identity, never inferred from a filename. */
  storyId: string
  /** Optional exact variant identity. */
  variantId?: string | null
}

/** Resolves live catalog titles while retaining IDs for unavailable targets. */
export function catalogTargetLabel(target: CatalogTarget | undefined, catalog?: Pick<HistoireCatalog, 'stories'>): string {
  if (!target) return ''
  const story = catalog?.stories.find(story => story.id === target.storyId)
  const variant = story?.variants.find(variant => variant.id === target.variantId)
  return [story?.title ?? target.storyId, target.variantId ? variant?.title ?? target.variantId : ''].filter(Boolean).join(' › ')
}
