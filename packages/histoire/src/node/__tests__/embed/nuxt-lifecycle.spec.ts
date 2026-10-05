import { describe, expect, it, vi } from 'vitest'
import { effectScope, ref, watch } from 'vue'
import { initializeNuxtPreviewLifecycle } from '../../../../../histoire-plugin-nuxt/src/runtime/nuxt-lifecycle.js'

describe('nuxt preview lifecycle', () => {
  it('registers cleanup before plugin startup and stops effects when startup fails before Vue mount', async () => {
    const scope = effectScope()
    const value = ref(0)
    const observed = vi.fn()
    const clearContext = vi.fn()
    let unmount: (() => void) | undefined
    const app: { onUnmount: (callback: () => void) => void, __HST_NUXT_CLEANUP__?: () => void } = { onUnmount: (callback) => {
      unmount = callback
    } }
    await expect(initializeNuxtPreviewLifecycle(app, scope, clearContext, async () => {
      expect(unmount).toBeTypeOf('function')
      scope.run(() => watch(value, observed, { flush: 'sync' }))
      value.value++
      throw new Error('plugin failed')
    })).rejects.toThrow('plugin failed')
    value.value++
    expect(observed).toHaveBeenCalledTimes(1)
    expect(clearContext).toHaveBeenCalledTimes(1)
    unmount!()
    app.__HST_NUXT_CLEANUP__!()
    expect(clearContext).toHaveBeenCalledTimes(1)
  })

  it('owns mount hooks and retires their captured callbacks when app closes', async () => {
    const app: any = {}
    const hook = vi.fn(async (_stage: string) => {})
    const stop = vi.fn()
    await initializeNuxtPreviewLifecycle(app, { stop }, () => {}, async () => {}, hook)
    const captured = app.__HST_NUXT_LIFECYCLE__
    await captured('app:beforeMount')
    await captured('app:mounted')
    await captured('app:suspense:resolve')
    expect(hook.mock.calls.map(([stage]) => stage)).toEqual(['app:beforeMount', 'app:mounted', 'app:suspense:resolve'])
    app.__HST_NUXT_CLEANUP__()
    await captured('app:mounted')
    expect(hook).toHaveBeenCalledTimes(3)
    expect(app.__HST_NUXT_LIFECYCLE__).toBeUndefined()
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('releases owned Nuxt resources if awaited mount hook fails', async () => {
    const app: any = {}
    const stop = vi.fn()
    const clear = vi.fn()
    await initializeNuxtPreviewLifecycle(app, { stop }, clear, async () => {}, async () => {
      throw new Error('mount failed')
    })
    await expect(app.__HST_NUXT_LIFECYCLE__('app:mounted')).rejects.toThrow('mount failed')
    expect(stop).toHaveBeenCalledTimes(1)
    expect(clear).toHaveBeenCalledTimes(1)
    app.__HST_NUXT_CLEANUP__()
    expect(stop).toHaveBeenCalledTimes(1)
  })
})
