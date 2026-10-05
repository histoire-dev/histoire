import { watch } from '@histoire/vendors/vue'
import { useMemo, useSyncExternalStore } from 'react'

/** Subscribe React to deep Vue state mutations using a stable numeric snapshot. */
export function useVariantState(state: Record<string, any> | undefined) {
  const store = useMemo(() => {
    let version = 0
    return {
      /** Snapshot changes only when subscription starts or Vue reports a mutation. */
      snapshot: () => version,
      /** Vue watcher belongs to React's subscription lifetime. */
      subscribe(listener: () => void) {
        if (!state) return () => {}
        // Child layout effects can mutate state before React subscribes. The
        // first notification invalidates that render without creating a watcher
        // during render; subsequent notifications track deep Vue mutations.
        return watch(state, () => {
          version++
          listener()
        }, { deep: true, flush: 'sync', immediate: true })
      },
    }
  }, [state])
  useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot)
  return state ?? {}
}
