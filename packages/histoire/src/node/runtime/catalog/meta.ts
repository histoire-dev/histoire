import type { HistoireDiagnostic, HistoireMeta } from '@histoire/protocol'
import { HISTOIRE_META_LIMITS, normalizeHistoireMeta } from '@histoire/protocol'

/** Running total of `meta` published in one catalog. */
export interface CatalogMetaBudget {
  /** JSON bytes of published `meta`. */
  bytes: number
  /** JSON values of published `meta`. */
  nodes: number
  /** Set once one `meta` did not fit: every later `meta` is left out too. */
  exhausted: boolean
}

/** Creates an empty catalog-wide `meta` budget. */
export function createCatalogMetaBudget(): CatalogMetaBudget {
  return { bytes: 0, nodes: 0, exhausted: false }
}

/**
 * Projects collected story or variant `meta` to catalog JSON. Metadata over its own bounds, or
 * past the catalog-wide budget, is left out and reported, so neither one oversized story nor
 * many valid ones can make the whole catalog invalid.
 * @param source Story or variant as collected (with `meta` and `metaOmitted`).
 * @param source.meta Collected `meta`.
 * @param source.metaOmitted Whether collection already dropped oversized `meta`.
 * @param owner Story (and variant) the metadata belongs to, for the warning.
 * @param owner.storyId Story id.
 * @param owner.variantId Variant id when projecting variant metadata.
 * @param budget Catalog-wide totals, updated with published `meta`.
 * @param warnings Receives the omission warning.
 */
export function projectMeta(source: { meta?: unknown, metaOmitted?: boolean } | undefined, owner: { storyId: string, variantId?: string }, budget: CatalogMetaBudget, warnings: HistoireDiagnostic[]): { meta?: HistoireMeta } {
  if (!source) return {}
  const target = owner.variantId ? `variant "${owner.variantId}" of story "${owner.storyId}"` : `story "${owner.storyId}"`
  /** Records one omission warning. */
  const omit = (reason: string) => {
    warnings.push(Object.freeze({ code: 'STORY_META_TOO_LARGE', message: `Metadata of ${target} ${reason} and was left out of the catalog`, severity: 'warning' as const, storyId: owner.storyId }))
    return {}
  }
  // Snapshot input is normalized already; normalizing again is cheap and yields the size.
  const { meta, tooLarge, bytes = 0, nodes = 0 } = normalizeHistoireMeta(source.meta)
  if (tooLarge || source.metaOmitted) return omit(`exceeds ${HISTOIRE_META_LIMITS.bytes} bytes or ${HISTOIRE_META_LIMITS.nodes} values`)
  if (!meta) return {}
  if (budget.exhausted || budget.bytes + bytes > HISTOIRE_META_LIMITS.catalogBytes || budget.nodes + nodes > HISTOIRE_META_LIMITS.catalogNodes) {
    budget.exhausted = true
    return omit(`exceeds the remaining catalog metadata budget (${HISTOIRE_META_LIMITS.catalogBytes} bytes, ${HISTOIRE_META_LIMITS.catalogNodes} values)`)
  }
  budget.bytes += bytes
  budget.nodes += nodes
  return { meta }
}
