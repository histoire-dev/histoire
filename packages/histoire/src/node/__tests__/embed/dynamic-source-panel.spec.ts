import { describe, expect, it } from 'vitest'
import { effectScope, nextTick, shallowRef } from 'vue'
import { useDynamicSourcePanel } from '../../../../../histoire-app/src/app/util/dynamic-source-panel.js'
import { deferred } from '../utils/mcp/deferred.js'

describe('standalone source panel readiness', () => {
  it('keeps initial dynamic mode while support generator loads and drops overtaken generation', async () => {
    const plugin = deferred<any>()
    const old = deferred<string>()
    const variant = shallowRef<any>({ id: 'old' })
    const scope = effectScope()
    const panel = scope.run(() => useDynamicSourcePanel(() => variant.value, () => () => plugin.promise))!
    await nextTick()
    expect(panel.displayedSource.value).toBe('dynamic')
    expect(panel.dynamicSourceCode.value).toBe('')
    plugin.resolve({ generateSourceCode: (value: any) => value.id === 'old' ? old.promise : '<Current/>' })
    await plugin.promise
    await nextTick()
    variant.value = { id: 'current' }
    await nextTick()
    await nextTick()
    expect(panel.dynamicSourceCode.value).toBe('<Current/>')
    expect(panel.displayedSource.value).toBe('dynamic')
    old.resolve('<Old/>')
    await old.promise
    await nextTick()
    expect(panel.dynamicSourceCode.value).toBe('<Current/>')
    scope.stop()
  })

  it('reads explicit/slot source before plugin readiness and uses static only after unavailable generator resolves', async () => {
    const plugin = deferred<any>()
    const variant = shallowRef<any>({ source: '<Explicit/>' })
    const scope = effectScope()
    const panel = scope.run(() => useDynamicSourcePanel(() => variant.value, () => () => plugin.promise))!
    await nextTick()
    expect(panel.dynamicSourceCode.value).toBe('<Explicit/>')
    variant.value = { slots: () => ({ source: () => [{ children: '<Slot/>' }] }) }
    await nextTick()
    await nextTick()
    expect(panel.dynamicSourceCode.value).toBe('<Slot/>')
    variant.value = {}
    await nextTick()
    await nextTick()
    expect(panel.displayedSource.value).toBe('dynamic')
    plugin.resolve({})
    await plugin.promise
    await nextTick()
    await nextTick()
    expect(panel.displayedSource.value).toBe('static')
    scope.stop()
  })
})
