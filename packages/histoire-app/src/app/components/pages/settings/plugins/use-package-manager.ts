import type { ChangePlan } from '@histoire/shared'
import type { MarketplaceStore } from '../../../../stores/marketplace.js'
import { installedPlugins } from 'virtual:$histoire-config'
import { onScopeDispose, shallowRef, watch } from 'vue'

/** Probe the pure planner for detection; never admit the returned plan as a job. */
export function usePackageManager(store: MarketplaceStore, dev: boolean) {
  const manager = shallowRef<ChangePlan['packageManager']>()
  const plugin = installedPlugins.find(item => item.packageName && item.version && !item.local)
  let controller: AbortController | undefined
  /** Preference changes retire old detection so an override never shows stale source. */
  async function load(): Promise<void> {
    controller?.abort()
    manager.value = undefined
    if (!dev || !plugin) return
    const current = controller = new AbortController()
    try {
      const plan = await store.client.plan({ kind: 'pin', id: plugin.packageName!, version: plugin.version, prefs: store.prefs.value }, { signal: current.signal })
      if (!current.signal.aborted) manager.value = plan.packageManager
    }
    catch { /* Detection is optional when the planner cannot safely read this project. */ }
  }
  watch(() => store.prefs.value.packageManager, load, { immediate: true })
  onScopeDispose(() => controller?.abort())
  return manager
}
