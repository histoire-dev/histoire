import type { CatalogStoryDto, CatalogVariantDto, CatalogWorkbenchDto } from '../protocol/catalog.js'

/** Result of resolving what a selection can do. */
export type TargetUrl = { url: string } | { problem: string }

/**
 * Builds the workbench URL of a story or variant against the public address actually bound
 * (`workbenchUrl` carries origin and base of the running proxy) with the child's router mode.
 * A story without variants, or a docs-only one, opens its story route; no variant ID is invented.
 * The route helpers (and the workbench protocol behind them) load on first use, never before the port binds.
 * @param options Public workbench URL, router facts and the exact selection.
 * @param options.publicUrl Bound public workbench URL, when known.
 * @param options.workbench Base and router mode reported by the runtime.
 * @param options.story Selected story.
 * @param options.variant Selected variant, when the variants list is shown.
 */
export async function resolveTargetUrl(options: { publicUrl: string | undefined, workbench: CatalogWorkbenchDto | undefined, story: CatalogStoryDto, variant?: CatalogVariantDto }): Promise<TargetUrl> {
  if (options.story.ambiguous) return { problem: 'Story ID is shared by several stories' }
  if (options.variant?.ambiguous) return { problem: 'Variant ID is shared by several variants' }
  if (!options.publicUrl) return { problem: 'Workbench address is not known yet' }
  if (!options.workbench) return { problem: 'Workbench base is unusable' }
  try {
    const { origin } = new URL(options.publicUrl)
    const { createStoryUrl } = await import('../../workbench-url.js')
    return { url: createStoryUrl({ origin, ...options.workbench, storyId: options.story.id, variantId: options.variant?.id }) }
  }
  catch (error) {
    return { problem: error instanceof Error ? error.message : String(error) }
  }
}
