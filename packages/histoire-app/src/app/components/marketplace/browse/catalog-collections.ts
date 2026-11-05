import type { CatalogPage } from '@histoire/shared'
import type { ShallowRef } from 'vue'
import type { MarketplaceStore } from '../../../stores/marketplace.js'
import { computed, shallowRef, watch } from 'vue'

/** Collection membership supplied by catalog, never inferred from labels. */
export type CatalogCollection = NonNullable<CatalogPage['discover']>['collections'][number]

/** Retain Discover collections across section mounts within one workbench. */
export function createCatalogCollections(page: ShallowRef<CatalogPage | undefined>, community: () => boolean) {
  const collections = shallowRef<CatalogCollection[]>([])
  const stopPage = watch(page, (value) => {
    if (value?.discover) collections.value = value.discover.collections
  })
  const stopPrefs = watch(community, () => {
    collections.value = []
  }, { flush: 'sync' })
  /** Release collection observers with their workbench. */
  function dispose(): void {
    stopPage()
    stopPrefs()
  }
  return { collections, dispose }
}

/** Select a full server collection without installing pagination observers. */
export function useCatalogCollections(store: MarketplaceStore) {
  const collections = store.collections
  const selectedCollection = computed(() => collections.value.find(collection => collection.id === store.filters.value.collection))
  /** Query full membership rather than the bounded Discover sample. */
  function selectCollection(value: CatalogCollection): void {
    store.setQuery('')
    store.setFilters({ collection: value.id })
    store.setView('all')
  }
  return { collections, selectedCollection, selectCollection }
}
