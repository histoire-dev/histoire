import { describe, expect, it } from 'vitest'
import { createRuntimeState } from '../../../../../histoire-app/src/embed/adapters/state.js'

describe('canonical runtime state', () => {
  it('resets serializable edits while retaining callbacks, instances and derived controls', () => {
    class Model { count = 1 }
    const callback = () => 1
    const model = new Model()
    const state = { count: 1, nested: { label: 'initial', callback }, model, _hPropDefs: { count: { type: 'number' } } }
    const runtime = createRuntimeState(() => state, value => structuredClone({ count: value.count, nested: { label: value.nested.label }, model: { count: value.model.count } }))
    runtime.capture()
    runtime.patch({ count: 7, nested: { label: 'edited' }, model: { count: 3 }, _hPropDefs: {} })
    runtime.patch({ nested: { callback: 'wire replacement' }, model: null })
    expect(state.count).toBe(7)
    expect(state.nested.callback).toBe(callback)
    expect(state.model).toBe(model)
    expect(state._hPropDefs.count.type).toBe('number')
    runtime.reset()
    expect(state.count).toBe(1)
    expect(state.nested.label).toBe('initial')
    expect(state.model.count).toBe(1)
    expect(state.model).toBe(model)
    expect(state._hPropDefs.count.type).toBe('number')
  })

  it('captures baseline once and preserves runtime-first boot defaults', () => {
    const callback = () => 1
    const state: Record<string, any> = { count: 4, nested: { callback } }
    const runtime = createRuntimeState(() => state, value => ({ count: value.count, nested: Object.fromEntries(Object.entries(value.nested).filter(([, item]) => typeof item !== 'function')) }))
    runtime.capture()
    runtime.patch({ count: 9, nested: { extra: 'added' }, extra: 'added' })
    const model = new class Model { value = 'instance' }()
    state.addedRuntime = { callback, model, count: 9, nested: { callback, count: 9 } }
    const cycle: Record<string, any> = { callback, count: 9 }
    cycle.self = cycle
    state.addedCycle = cycle
    runtime.capture()
    runtime.reset()
    expect(state.count).toBe(4)
    expect(state.extra).toBeUndefined()
    expect(state.nested.extra).toBeUndefined()
    expect(state.nested.callback).toBe(callback)
    expect(state.addedRuntime).toEqual({ callback, model, nested: { callback } })
    expect(state.addedCycle.self).toBe(cycle)
    expect(state.addedCycle.count).toBeUndefined()
  })
})
