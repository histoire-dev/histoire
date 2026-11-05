import type { MarketplaceUpdate } from '@histoire/shared'
import type { MarketplaceStore } from '../../../../stores/marketplace.js'
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'

/** One cache per workbench; embeddings never share project inventory. */
const sessions = new WeakMap<MarketplaceStore, ReturnType<typeof createUpdates>>()

/** Create retained data separately from the lifetime of mounted consumers. */
function createUpdates(store: MarketplaceStore) {
  const entries = shallowRef<MarketplaceUpdate[]>([])
  const loading = ref(false)
  const error = ref('')
  const acknowledged = ref<string>()
  const receiptKey = `_histoire-marketplace-acknowledged:${import.meta.env.BASE_URL}`
  try {
    acknowledged.value = sessionStorage.getItem(receiptKey) ?? undefined
  }
  catch { /* Receipt acknowledgement is optional when storage is blocked. */ }
  let cached: string | undefined
  let controller: AbortController | undefined
  let consumers = 0
  let stops: Array<() => void> = []
  const available = computed(() => entries.value.filter(item => store.prefs.value.skippedVersions[item.id] !== item.to))
  const count = computed(() => available.value.length)
  const preferenceKey = computed(() => JSON.stringify([store.prefs.value.community, store.prefs.value.skippedVersions]))
  const newPlugin = computed(() => {
    const job = store.job.value
    return job?.kind === 'install' && job.status === 'succeeded' && acknowledged.value !== job.jobId ? job.id : undefined
  })

  /** Coalesce mounted consumers; changed consent retires the earlier request. */
  async function refresh(force = false): Promise<void> {
    const key = preferenceKey.value
    if (!force && (cached === key || loading.value)) return
    controller?.abort()
    const current = controller = new AbortController()
    loading.value = true
    error.value = ''
    try {
      const value = await store.client.updates(store.prefs.value, { signal: current.signal })
      if (!current.signal.aborted) {
        entries.value = value
        cached = key
      }
    }
    catch (cause) {
      if (!current.signal.aborted) error.value = cause instanceof Error ? cause.message : 'Could not check updates'
    }
    finally { if (controller === current) loading.value = false }
  }
  /** Keep successful update receipts from leaving an obsolete rail badge. */
  function completed(): void {
    const job = store.job.value
    if (job?.status !== 'succeeded') return
    entries.value = entries.value.filter(item => item.id !== job.id || !['update', 'remove'].includes(job.kind))
    cached = undefined
  }
  /** Acknowledgement follows the receipt, rather than hiding future installs. */
  function acknowledge(): void {
    const job = store.job.value
    if (job?.kind !== 'install' || job.status !== 'succeeded') return
    acknowledged.value = job.jobId
    try {
      sessionStorage.setItem(receiptKey, job.jobId)
    }
    catch { /* Live acknowledgement still works without persistence. */ }
  }
  /** Only the first mounted consumer starts session observers. */
  function acquire(): void {
    if (consumers++ > 0) return
    stops = [watch(preferenceKey, () => {
      void refresh(true)
    }), watch(store.job, completed)]
    void refresh()
  }
  /** Last consumer cancels pending reads without discarding cached data. */
  function release(): void {
    if (--consumers > 0) return
    stops.forEach(stop => stop())
    stops = []
    controller?.abort()
    loading.value = false
  }
  return { available, count, loading, error, newPlugin, acknowledge, refresh, acquire, release }
}

/** Mount in both rail and section; both share one request and retained count. */
export function usePluginUpdates(store: MarketplaceStore, dev = __HISTOIRE_DEV__) {
  let state = sessions.get(store)
  if (!state) sessions.set(store, state = createUpdates(store))
  if (dev) {
    onMounted(state.acquire)
    onUnmounted(state.release)
  }
  return state
}
