/** Stable semantic IDs remain valid when virtual rows recycle their DOM nodes. */
export const SEARCH_RESULTS_ID = 'histoire-search-results'
/** Input and active native row share this live semantic cursor description. */
export const SEARCH_ACTIVE_RESULT_ID = 'histoire-search-active-result'

/** Encodes provider result identity for a CSS-independent, collision-safe DOM ID. */
export function getSearchResultDomId(id: string): string {
  return `histoire-search-result-${encodeURIComponent(id)}`
}

/** Commands occupy their own namespace because plugin IDs may match source result IDs. */
export function getSearchCommandDomId(id: string): string {
  return `histoire-search-command-${encodeURIComponent(id)}`
}
