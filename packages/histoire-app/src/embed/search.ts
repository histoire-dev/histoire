import type { HistoireSearchResult, HistoireSourceSearchData } from '@histoire/protocol'
import { HistoireSdkError, validateHistoireTarget, validateWireValue } from '@histoire/protocol'
import { matchSearchText } from './search-match.js'

/** Validates structured source search rows before shared relevance matching. */
export function validateEmbedSearch(value: unknown): HistoireSourceSearchData {
  validateWireValue(value, { kind: 'descriptor', name: 'search' })
  const data = value as HistoireSourceSearchData
  if (!data || !Array.isArray(data.titles) || !Array.isArray(data.docs)) throw new HistoireSdkError('INVALID_ARGUMENT', 'Invalid source search data')
  for (const row of [...data.titles, ...data.docs]) {
    validateHistoireTarget(row.target)
    if (!['story', 'variant', 'docs'].includes(row.kind) || typeof row.title !== 'string' || typeof row.text !== 'string') throw new HistoireSdkError('INVALID_ARGUMENT', 'Invalid source search row')
  }
  return data
}

/** Searches titles and full docs together, preserving separate story/document actions. */
export function searchEmbedData(data: HistoireSourceSearchData, query: string): readonly HistoireSearchResult[] {
  const candidates = [
    ...data.titles.map(item => ({ item, titles: [item.title], context: item.text })),
    ...data.docs.map(item => ({ item, titles: [item.title], context: item.text })),
  ]
  const seen = new Set<string>()
  const results: HistoireSearchResult[] = []
  for (const { item, match } of matchSearchText(candidates, query)) {
    const key = JSON.stringify([item.target.storyId, item.target.variantId, item.kind])
    if (!seen.has(key)) {
      results.push({ target: item.target, kind: item.kind, title: item.title, rank: results.length, match })
      seen.add(key)
    }
  }
  return results
}
