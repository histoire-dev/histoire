import type { CatalogSnapshot } from '../../runtime/catalog/types.js'

/** Reuses completed allowlisted browser projection; never maps live story modules. */
export function projectEmbedCatalog(snapshot: CatalogSnapshot) {
  return snapshot.catalog
}
