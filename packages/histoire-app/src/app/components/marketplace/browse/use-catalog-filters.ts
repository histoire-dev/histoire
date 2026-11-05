import type { CatalogQuery } from '@histoire/shared'
import { computed } from 'vue'
import { useMarketplaceStore } from '../../../stores/marketplace.js'
import { additions, categories, frameworkLabel } from './labels.js'

/** One removable catalog constraint, excluding search text. */
interface FilterChip {
  /** Stable constraint identity. */ key: string
  /** Human-readable value. */ label: string
  /** Query facet carrying the value. */ field: keyof NonNullable<CatalogQuery['filters']>
  /** Selected member for multi-value facets. */ value?: string
}

/** Shared facet editing keeps checkbox, chip and switch behavior consistent. */
export function useCatalogFilters() {
  const store = useMarketplaceStore()
  const chips = computed<FilterChip[]>(() => {
    const filters = store.filters.value
    return [
      ...(filters.category ? [{ key: 'category', label: categories[filters.category], field: 'category' as const }] : []),
      ...(filters.frameworks ?? []).map(value => ({ key: `framework-${value}`, label: frameworkLabel(value), field: 'frameworks' as const, value })),
      ...(filters.officialOnly ? [{ key: 'official', label: 'Official only', field: 'officialOnly' as const }] : []),
      ...(filters.adds ?? []).map(value => ({ key: `add-${value}`, label: additions[value], field: 'adds' as const, value })),
      ...(filters.collection ? [{ key: 'collection', label: filters.collection, field: 'collection' as const }] : []),
    ]
  })
  /** Change only chosen members and drop empty arrays from outgoing requests. */
  function toggle(field: 'frameworks' | 'adds', values: string[], checked: boolean): void {
    const selected = new Set<string>(store.filters.value[field] ?? [])
    for (const value of values) {
      if (checked) selected.add(value)
      else selected.delete(value)
    }
    const filters = { ...store.filters.value, [field]: [...selected] }
    if (!selected.size) delete filters[field]
    store.setFilters(filters)
  }
  /** Remove one chip without resetting unrelated filters or search. */
  function remove(chip: FilterChip): void {
    if (chip.field === 'frameworks' || chip.field === 'adds') {
      toggle(chip.field, [chip.value!], false)
    }
    else {
      const filters = { ...store.filters.value }
      delete filters[chip.field]
      store.setFilters(filters)
    }
  }
  return { chips, toggle, remove }
}
