import type { CatalogEntry, CatalogPage, CatalogQuery } from '../types/marketplace.js'
import { addKinds, categories } from './enums.js'

/** Apply selected facets; framework-agnostic plugins match every framework filter. */
export function filterCatalog<T extends CatalogEntry>(entries: T[], filters: CatalogQuery['filters'] = {}): T[] {
  return entries.filter(entry => (!filters.category || filters.category === entry.category)
    && (!filters.officialOnly || entry.official)
    && (!filters.frameworks?.length || !entry.frameworks.length || filters.frameworks.some(framework => entry.frameworks.includes(framework)))
    && (!filters.adds?.length || filters.adds.some(kind => entry.adds.some(add => add.kind === kind))))
}
/**
 * Count each facet against the other selections, excluding its own filter.
 * @param entries Ranked catalog entries.
 * @param filters Active selections.
 * @param detected Project frameworks, counted even when no plugin names them (agnostic plugins match).
 */
export function catalogFacets(entries: CatalogEntry[], filters: CatalogQuery['filters'] = {}, detected: string[] = []): CatalogPage['facets'] {
  const category = Object.fromEntries(categories.map(category => [category, filterCatalog(entries, { ...filters, category: undefined }).filter(entry => entry.category === category).length])) as CatalogPage['facets']['category']
  const adds = Object.fromEntries(addKinds.map(kind => [kind, filterCatalog(entries, { ...filters, adds: undefined }).filter(entry => entry.adds.some(add => add.kind === kind)).length])) as CatalogPage['facets']['adds']
  const frameworks = Object.fromEntries([...new Set([...detected, ...entries.flatMap(entry => entry.frameworks)])].map(framework => [framework, filterCatalog(entries, { ...filters, frameworks: [framework] }).length]))
  return { category, frameworks, adds, official: filterCatalog(entries, { ...filters, officialOnly: undefined }).filter(entry => entry.official).length }
}
