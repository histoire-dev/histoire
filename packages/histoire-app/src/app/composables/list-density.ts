import { computed } from 'vue'
import { useUiSettingsStore } from '../stores/settings.js'

/** Recycler geometry reads the same nearest workbench owner as density controls. */
export function useWorkbenchListSizes(itemSize: () => number | undefined, minItemSize: () => number | undefined) {
  const settings = useUiSettingsStore()
  const reduction = computed(() => settings?.state.density === 'compact' ? 4 : 0)
  return {
    /** Fixed offsets include their one-pixel visual gap in either density. */
    itemSize: computed(() => itemSize() === undefined ? undefined : Math.max(24, itemSize()! - reduction.value)),
    /** Dynamic content remains measured; this value is only initial estimate. */
    minItemSize: computed(() => Math.max(24, (minItemSize() ?? 40) - reduction.value)),
  }
}
