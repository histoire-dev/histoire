import type { CatalogEntry } from '@histoire/shared'

/** Rank case-insensitive token matches, reporting inclusive original-string offsets. */
export function searchCatalog<T extends CatalogEntry>(entries: T[], query = ''): T[] {
  const tokens = [...new Set(query.trim().toLowerCase().split(/\s+/).filter(Boolean))]
  if (!tokens.length) return entries.map(entry => ({ ...entry, match: undefined, score: undefined }))
  return entries.flatMap((entry) => {
    const match: CatalogEntry['match'] = []
    const matched = new Set<string>()
    let score = 0
    for (const field of ['displayName', 'summary', 'id'] as const) {
      const text = entry[field]
      // Folding can change UTF-16 length: compare slices at original-string offsets.
      const ranges: Array<[number, number]> = []
      for (const token of tokens) {
        for (let offset = 0; offset <= text.length - token.length; offset++) {
          if (text.slice(offset, offset + token.length).toLowerCase() === token) {
            ranges.push([offset, offset + token.length - 1])
            matched.add(token)
            score += (field === 'displayName' ? 10 : field === 'id' ? 5 : 1) + (offset === 0 ? 2 : 0)
          }
        }
      }
      if (ranges.length) {
        ranges.sort((a, b) => a[0] - b[0])
        match.push({ field, ranges })
      }
    }
    return matched.size === tokens.length ? [{ ...entry, score, match }] : []
  }).sort((a, b) => b.score! - a.score! || a.id.localeCompare(b.id))
}
