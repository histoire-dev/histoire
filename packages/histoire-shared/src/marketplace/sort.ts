import type { CatalogEntry, CatalogQuery } from '../types/marketplace.js'

/** Default page size shared by static and development catalogs. */
export const catalogPageSize = 30

/** Sort a filtered copy, preserving ranked order unless an explicit sort is selected. */
export function sortCatalog<T extends CatalogEntry>(entries: T[], sort?: CatalogQuery['sort']): T[] {
  const output = [...entries]
  if (sort === 'name') output.sort((a, b) => a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id))
  if (sort === 'updated') output.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') || a.id.localeCompare(b.id))
  return output
}
