import type { Ref } from 'vue'
import { onBeforeUnmount, watch } from 'vue'
import { useWorkbenchTestsModel } from './model.js'

/** Capture requests preempt provider-local discovery before their transport admission. */
export function useCaptureDiscoveryPause(requestId: Ref<string | null>): void {
  const model = useWorkbenchTestsModel()
  let release: (() => void) | undefined
  const stop = watch(requestId, (value) => {
    if (value && !release) {
      release = model?.suspendDiscovery()
    }
    else if (!value) {
      release?.()
      release = undefined
    }
  }, { flush: 'sync' })
  onBeforeUnmount(() => {
    stop()
    release?.()
  })
}
