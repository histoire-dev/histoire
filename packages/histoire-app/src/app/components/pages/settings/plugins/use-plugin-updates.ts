import type { MarketplaceUpdate } from '@histoire/shared'
import type { MarketplaceServiceOwner } from '../../../marketplace/shell/marketplace-services.js'
import { computed, ref, shallowRef, watch } from 'vue'

/** Retain project update inventory until its workbench is disposed. */
export function createPluginUpdates(store: MarketplaceServiceOwner, dev: boolean) {
  const entries = shallowRef<MarketplaceUpdate[]>([])
  const loading = ref(false)
  const error = ref('')
  const acknowledged = ref<string>()
  const receiptKey = `_histoire-marketplace-acknowledged:${import.meta.env.BASE_URL}`
  try {
    acknowledged.value = sessionStorage.getItem(receiptKey) ?? undefined
  }
  catch { /* Receipt acknowledgement is optional when storage is blocked. */ }
  let connected = false
  let disposed = false
  let cached: string | undefined
  let controller: AbortController | undefined
  const available = computed(() => entries.value.filter(item => store.prefs.value.skippedVersions[item.id] !== item.to))
  const count = computed(() => available.value.length)
  // Update selection can fall back to an older release when its newest version is skipped.
  const preferenceKey = computed(() => JSON.stringify([store.prefs.value.community, store.prefs.value.skippedVersions]))
  const newPlugin = computed(() => {
    const job = store.job.value
    return job?.kind === 'install' && job.status === 'succeeded' && acknowledged.value !== job.jobId ? job.id : undefined
  })

  /** Coalesce workbench reads; changed consent retires the earlier request. */
  async function refresh(force = false): Promise<void> {
    if (!connected || disposed || !dev) return
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
  const stops = dev
    ? [watch(preferenceKey, () => {
        void refresh(true)
      }), watch(store.job, completed)]
    : []
  /** Begin inventory reads with the owning workbench connection. */
  function connect(): void {
    connected = true
    void refresh()
  }
  /** Retire pending reads without depending on rail or settings mounts. */
  function dispose(): void {
    disposed = true
    stops.forEach(stop => stop())
    controller?.abort()
    loading.value = false
  }
  return { available, count, loading, error, newPlugin, acknowledge, refresh, connect, dispose }
}
