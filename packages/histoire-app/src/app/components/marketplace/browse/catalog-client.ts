import type { CatalogPage, CatalogQuery } from '@histoire/shared'
import type { marketplaceClient, MarketplaceRequestOptions } from '../../../util/marketplace-client.js'

/** Marketplace client with explicit catalog lifetime cleanup. */
type DebouncedCatalogClient = typeof marketplaceClient & {
  /** Release scheduled reads and their eventual channel subscriptions. */ disposeCatalog: () => void
}
/** Debounce channel reads and retire listeners immediately, including during the delay. */
export function createDebouncedCatalogClient(client: typeof marketplaceClient): DebouncedCatalogClient {
  let cancel: (() => void) | undefined
  /** One pending read owns its timer, signal and eventual channel listener. */
  function catalog(query: CatalogQuery, options: MarketplaceRequestOptions = {}): Promise<CatalogPage> {
    cancel?.()
    // Capture reactive inputs now; delayed sends must not observe later caller mutations.
    const snapshot: CatalogQuery = JSON.parse(JSON.stringify(query))
    return new Promise((resolve, reject) => {
      const controller = new AbortController()
      let settled = false
      let timer: ReturnType<typeof setTimeout> | undefined
      /** Clear both scheduled and active work exactly once. */
      function finish(error?: unknown, page?: CatalogPage): void {
        if (settled) return
        settled = true
        clearTimeout(timer)
        options.signal?.removeEventListener('abort', abort)
        if (cancel === abort) cancel = undefined
        if (error) reject(error)
        else resolve(page!)
      }
      /** Retired requests cannot keep a channel listener or publish a late reply. */
      function abort(): void {
        controller.abort()
        finish(new DOMException('Request aborted', 'AbortError'))
      }
      cancel = abort
      options.signal?.addEventListener('abort', abort, { once: true })
      if (options.signal?.aborted) {
        abort()
      }
      else {
        timer = setTimeout(() => {
          void client.catalog(snapshot, { ...options, signal: controller.signal }).then(page => finish(undefined, page), finish)
        }, 150)
      }
    })
  }
  /** Owners call this on close or disposal; server jobs remain independent. */
  function disposeCatalog(): void {
    cancel?.()
  }
  return { ...client, catalog, disposeCatalog }
}
