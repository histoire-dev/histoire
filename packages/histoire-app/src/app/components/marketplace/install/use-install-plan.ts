import type { ChangeRequest } from '@histoire/shared'
import type { Ref } from 'vue'
import { onScopeDispose, ref, shallowRef, watch } from 'vue'
import { useMarketplaceStore } from '../../../stores/marketplace.js'

/** Debounced plan ownership: edited inputs immediately retire the reviewed capability. */
export function useInstallPlan(request: Ref<ChangeRequest | undefined>) {
  const store = useMarketplaceStore()
  const plan = shallowRef<Awaited<ReturnType<typeof store.client.plan>>>()
  const loading = ref(false)
  const error = ref<string>()
  let controller: AbortController | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let initialized = false

  /** Abort obsolete reads before their debounce replacement is even sent. */
  function retire(): void {
    clearTimeout(timer)
    controller?.abort()
  }
  /** Fetch the exact current intent; only its controller may publish a capability. */
  async function replan(): Promise<void> {
    retire()
    if (!request.value) return
    const current = controller = new AbortController()
    loading.value = true
    error.value = undefined
    try {
      const value = await store.client.plan(request.value, { signal: current.signal })
      if (!current.signal.aborted) plan.value = value
    }
    catch (cause) {
      if (!current.signal.aborted) error.value = cause instanceof Error ? cause.message : 'Could not plan changes'
    }
    finally {
      if (controller === current) loading.value = false
    }
  }
  watch(request, (value) => {
    retire()
    plan.value = undefined
    error.value = undefined
    loading.value = !!value
    if (!value) return
    if (!initialized) {
      initialized = true
      void replan()
    }
    else {
      timer = setTimeout(replan, 200)
    }
  }, { deep: true, immediate: true, flush: 'sync' })
  const offClose = store.onClose(retire)
  onScopeDispose(() => {
    offClose()
    retire()
  })
  return { plan, loading, error, replan }
}
