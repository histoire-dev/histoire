import type { HistoireSearchResult, HistoireSourceSearchData, HistoireSourceSearchRow } from '@histoire/protocol'
import { HistoireSdkError, validateHistoireTarget, validateWireValue } from '@histoire/protocol'
import Fuse from 'fuse.js'

/** Validates structured source search rows before existing Fuse ranking processes text. */
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

/** Preserves title-first/then-docs ranking and exact tuple identity from standalone search. */
export function searchEmbedData(data: HistoireSourceSearchData, query: string): readonly HistoireSearchResult[] {
  const search = (rows: readonly HistoireSourceSearchRow[]) => new Fuse([...rows], { keys: ['text'] }).search(query)
  const seen = new Set<string>()
  const results: HistoireSearchResult[] = []
  for (const rows of [data.titles, data.docs]) {
    let rank = 0
    for (const { item } of search(rows)) {
      const key = JSON.stringify([item.target.storyId, item.target.variantId])
      if (!seen.has(key)) {
        results.push({ target: item.target, kind: item.kind, title: item.title, rank })
        seen.add(key)
      }
      rank++
    }
  }
  return results
}
