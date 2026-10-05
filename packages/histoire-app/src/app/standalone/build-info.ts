import { useHistoireResource } from '@histoire/vue/internal'
import { buildInfo, onBuildInfoUpdate } from 'virtual:$histoire-build-info'
import { shallowRef } from 'vue'

/** Reactive metadata publication belongs to one workbench provider lifetime. */
export function useWorkbenchBuildInfo() {
  const info = shallowRef(buildInfo)
  useHistoireResource(onBuildInfoUpdate(value => info.value = value))
  return info
}
