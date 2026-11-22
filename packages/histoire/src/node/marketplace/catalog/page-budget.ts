import type { CatalogPage } from '@histoire/shared'
import { isUiChannelEventWithinBudget } from '../../server/ui-channel/validation.js'

/** Limit Discover extras and advance pagination by the actual rows sent. */
export function fitCatalogPage(page: CatalogPage, offset: number): CatalogPage {
  const event = 'histoire:ui:marketplace-catalog-result'
  const discover = page.discover
  // Reserve space for a maximum-length request ID and the updated cursor.
  while (!isUiChannelEventWithinBudget(event, { page }, 160)) {
    const collection = discover?.collections.findLast(item => item.entries.length)
    if (collection) {
      collection.entries.pop()
    }
    else if (discover?.collections.length) {
      discover.collections = []
    }
    else if (discover?.picks.length) {
      discover.picks.pop()
    }
    else if (discover?.hero) {
      delete discover.hero
    }
    else if (page.entries.length > 1) {
      page.entries.pop()
      page.cursor = String(offset + page.entries.length)
    }
    else {
      break
    }
  }
  return page
}
