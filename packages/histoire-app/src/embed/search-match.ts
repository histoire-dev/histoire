import type { HistoireSearchResult } from '@histoire/protocol'
import Fuse from 'fuse.js'

/** Comparable evidence reused by source results and runtime-owned prop names. */
export type SearchMatch = NonNullable<HistoireSearchResult['match']>

/** A searchable item keeps its original value separate from normalized text. */
export interface SearchTextCandidate<T> {
  /** Original result or prop metadata. */
  item: T
  /** Equivalent display-title spellings with equal relevance. */
  titles: readonly string[]
  /** Lower-priority documentation body or story/component context. */
  context?: string
}

/** Case and whitespace normalization is shared across every search field. */
export function normalizeSearchText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Literal evidence always removes typo fallback, then stable sorting retains source ties. */
export function rankSearchMatches<T extends { match?: HistoireSearchResult['match'] }>(results: readonly T[]): T[] {
  // Legacy adapters have no matching evidence. Keep their received order and
  // treat them as literal so an old adapter never disappears behind fallback.
  const literal = results.some(result => result.match?.mode !== 'fuzzy')
  return results.filter(result => !literal || result.match?.mode !== 'fuzzy')
    .sort((left, right) => (left.match?.score ?? 3) - (right.match?.score ?? 3))
}

/** Ranks literal titles before context; Fuse runs only when literal matching found nothing. */
export function matchSearchText<T>(candidates: readonly SearchTextCandidate<T>[], query: string): { item: T, match: SearchMatch }[] {
  const text = normalizeSearchText(query)
  if (!text) return []
  const rows = candidates.map(candidate => ({ ...candidate, titles: candidate.titles.map(normalizeSearchText), context: normalizeSearchText(candidate.context ?? '') }))
  const literal = rows.flatMap(({ item, titles, context }) => {
    let score = Infinity
    for (const title of titles) {
      if (title === text) score = 0
      else if (title.startsWith(text)) score = Math.min(score, 1)
      else if (title.includes(text)) score = Math.min(score, 2)
    }
    if (context.includes(text)) score = Math.min(score, 3)
    return Number.isFinite(score) ? [{ item, match: { mode: 'literal' as const, score } }] : []
  })
  if (literal.length) return rankSearchMatches(literal)
  if (text.length < 5) return []
  const index = new Fuse(rows, { keys: ['titles', 'context'], threshold: 0.2, ignoreLocation: true, ignoreFieldNorm: true, includeScore: true })
  return index.search(text).map(({ item, score }) => ({ item: item.item, match: { mode: 'fuzzy', score: 4 + (score ?? 0) } }))
}
