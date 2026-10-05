import type { Variant } from '../types.js'
import { ref, shallowRef, watch, watchEffect } from 'vue'
import { getDynamicSourceCode } from './dynamic-source.js'

/** Support plugin may finish loading with no dynamic generator capability. */
interface DynamicSourcePlugin {
  /** Runs only inside current standalone story runtime. */
  generateSourceCode?: (variant: Variant) => unknown | Promise<unknown>
}

/** Standalone mode keeps pending generation distinct from proven unavailable source. */
export function useDynamicSourcePanel(getVariant: () => Variant, getPlugin: () => (() => Promise<DynamicSourcePlugin>) | undefined) {
  const generate = shallowRef<DynamicSourcePlugin['generateSourceCode']>()
  const ready = ref(false)
  const pluginError = shallowRef<unknown>()
  const dynamicSourceCode = ref('')
  const error = ref<string | null>(null)
  const displayedSource = ref<'dynamic' | 'static'>('dynamic')

  watchEffect((onCleanup) => {
    let active = true
    onCleanup(() => {
      active = false
    })
    const load = getPlugin()
    generate.value = undefined
    pluginError.value = undefined
    ready.value = !load
    if (load) {
      void load().then((plugin) => {
        if (!active) return
        generate.value = plugin.generateSourceCode
        ready.value = true
      }).catch((failure) => {
        if (!active) return
        pluginError.value = failure
        ready.value = true
      })
    }
  })

  watch(() => [getVariant(), generate.value, ready.value, pluginError.value], async (_, __, onCleanup) => {
    let active = true
    onCleanup(() => {
      active = false
    })
    error.value = null
    dynamicSourceCode.value = ''
    try {
      const source = await getDynamicSourceCode(getVariant(), generate.value)
      if (!active) return
      dynamicSourceCode.value = source?.body ?? ''
      if (!source && ready.value) {
        if (pluginError.value) throw pluginError.value
        // Initial plugin loading is not evidence that dynamic source is absent.
        // Preserve explicit user mode when a later generator becomes available.
        displayedSource.value = 'static'
      }
    }
    catch (failure) {
      if (active) error.value = failure instanceof Error ? failure.message : String(failure)
    }
  }, { deep: true, immediate: true })

  return { dynamicSourceCode, error, displayedSource }
}
