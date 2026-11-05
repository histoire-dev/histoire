import type { PluginDetail } from '@histoire/shared'
import { onScopeDispose, ref, shallowRef, watch } from 'vue'
import { useMarketplaceStore } from '../../../stores/marketplace.js'

/** Own detail reads for one visible package visit; obsolete replies cannot publish. */
export function usePluginDetail() {
  const store = useMarketplaceStore()
  const detail = shallowRef<PluginDetail>()
  const loading = ref(false)
  const error = ref<string>()
  const notFound = ref(false)
  let controller: AbortController | undefined

  /** Replace the previous read and clear metadata before another package can act. */
  async function load(): Promise<void> {
    controller?.abort()
    controller = undefined
    detail.value = undefined
    error.value = undefined
    notFound.value = false
    loading.value = false
    const id = store.selectedId.value
    if (!id) return
    const current = controller = new AbortController()
    loading.value = true
    try {
      const result = await store.client.detail(id, store.prefs.value, { signal: current.signal })
      if (!current.signal.aborted) detail.value = result
    }
    catch (cause) {
      if (current.signal.aborted) return
      const message = cause instanceof Error ? cause.message : 'Could not load plugin'
      if (cause && typeof cause === 'object' && 'code' in cause && cause.code === 'not-found') notFound.value = true
      else error.value = message
    }
    finally {
      if (controller === current) loading.value = false
    }
  }
  const stop = watch([store.selectedId, () => store.prefs.value.community], load, { deep: true, immediate: true, flush: 'sync' })
  const offClose = store.onClose(() => controller?.abort())
  onScopeDispose(() => {
    offClose()
    stop()
    controller?.abort()
  })
  return { detail, loading, error, notFound, load }
}
