import type { CatalogEntry } from '@histoire/shared'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useMarketplaceStore } from '../../../stores/marketplace.js'
import { useCatalogCollections } from './catalog-collections.js'

/** Adapt shared store data without starting a second first-page request owner. */
export function useCatalogQuery() {
  const store = useMarketplaceStore()
  const { collections, selectedCollection, selectCollection } = useCatalogCollections(store)
  let activeMore: AbortController | undefined
  /** Additional server pages, separate from the store's retained first page. */
  const extra = shallowRef<CatalogEntry[]>([])
  /** Next opaque page cursor. */
  const cursor = ref<string>()
  /** Cursor request activity, independent from first-page refreshes. */
  const loadingMore = ref(false)
  /** Recoverable cursor error keeps existing rows usable. */
  const moreError = ref<string>()
  const entries = computed(() => [...(store.page.value?.entries ?? []), ...extra.value])
  watch(() => store.page.value, (page) => {
    retireMore()
    extra.value = []
    cursor.value = page?.cursor
    moreError.value = undefined
  }, { immediate: true })
  // Retire old cursors immediately, before the store's debounced first-page read.
  watch([store.query, store.filters, store.sort, () => store.prefs.value.community], () => {
    retireMore()
    cursor.value = undefined
    moreError.value = undefined
  }, { deep: true, flush: 'sync' })
  /** Retire cursor ownership before a new first page or component lifetime starts. */
  function retireMore(): void {
    activeMore?.abort()
    activeMore = undefined
    loadingMore.value = false
  }
  /** Reset search and facets together so empty-state recovery always widens results. */
  function clearFilters(): void {
    store.setQuery('')
    store.setFilters({})
  }
  /** Append a server cursor page; page/filter changes retire this request. */
  async function loadMore(): Promise<void> {
    if (!cursor.value || loadingMore.value || store.loading.value || store.error.value) return
    loadingMore.value = true
    moreError.value = undefined
    const controller = activeMore = new AbortController()
    try {
      const page = await store.client.catalog({ view: 'all', query: store.query.value, filters: store.filters.value, sort: store.sort.value, prefs: store.prefs.value, cursor: cursor.value }, { signal: controller.signal })
      if (activeMore !== controller || controller.signal.aborted) return
      const seen = new Set(entries.value.map(entry => entry.id))
      extra.value = [...extra.value, ...page.entries.filter(entry => !seen.has(entry.id))]
      cursor.value = page.cursor
    }
    catch (cause) {
      if (activeMore === controller && !controller.signal.aborted) moreError.value = cause instanceof Error ? cause.message : 'Could not load plugins'
    }
    finally { if (activeMore === controller) loadingMore.value = false }
  }
  const offClose = store.onClose(retireMore)
  onBeforeUnmount(() => {
    offClose()
    retireMore()
  })
  return { store, entries, selectedCollection, collections, cursor, loadingMore, moreError, selectCollection, clearFilters, loadMore }
}
