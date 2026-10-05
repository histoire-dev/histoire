import { describe, expect, it } from 'vitest'
import { toRawDeep } from '../../../../../histoire-app/src/app/util/state.js'
import { createRuntimeStatePresets } from '../../../../../histoire-app/src/embed/adapters/state-presets.js'
import { createRuntimeState } from '../../../../../histoire-app/src/embed/adapters/state.js'

describe('runtime-owned state presets', () => {
  it('resets initial state only when deleting selected preset', () => {
    const callback = () => 'runtime'
    const state = { count: 1, callback }
    const serialize = (value: any) => toRawDeep(value, true)
    const runtime = createRuntimeState(() => state, serialize)
    runtime.capture()
    const presets = createRuntimeStatePresets(() => state, serialize, undefined, () => runtime.reset())
    state.count = 3
    const first = presets.execute({ action: 'save', label: 'First' }).selectedId!
    state.count = 7
    const second = presets.execute({ action: 'save', label: 'Second' }).selectedId!
    presets.execute({ action: 'delete', id: first })
    expect(state.count).toBe(7)
    expect(presets.execute({ action: 'list' }).selectedId).toBe(second)
    const result = presets.execute({ action: 'delete', id: second })
    expect(state.count).toBe(1)
    expect(state.callback).toBe(callback)
    expect(result).toEqual({ items: [] })
  })

  it('retains callbacks, class identity, cyclic state and current derived control definitions', () => {
    class Model { value = 'initial' }
    const callback = () => 'saved'
    const model = new Model()
    const state: any = { count: 1, callback, model, nested: { callback }, _hPropDefs: ['original'] }
    state.self = state
    const presets = createRuntimeStatePresets(() => state, value => toRawDeep(value, true))
    const saved = presets.execute({ action: 'save', label: 'Saved' })
    expect(saved).toEqual({ items: [{ id: 'preset-1', label: 'Saved' }], selectedId: 'preset-1' })
    state.callback = () => 'changed'
    state.count = 9
    state.model.value = 'changed'
    state.extra = 'added'
    state.nested = null
    state._hPropDefs = ['new definitions']
    presets.execute({ action: 'apply', id: saved.selectedId })
    expect(state.count).toBe(1)
    expect(state.callback).toBe(callback)
    expect(state.nested.callback).toBe(callback)
    expect(state.model).toBe(model)
    expect(state.model.value).toBe('initial')
    expect(state.self).toBe(state)
    expect(state.extra).toBeUndefined()
    expect(state._hPropDefs).toEqual(['new definitions'])
    presets.execute({ action: 'rename', id: saved.selectedId, label: 'Renamed' })
    expect(presets.execute({ action: 'list' }).items).toEqual([{ id: 'preset-1', label: 'Renamed' }])
    presets.execute({ action: 'delete', id: saved.selectedId })
    expect(() => presets.execute({ action: 'apply', id: saved.selectedId })).toThrow('Unknown runtime preset')
  })
})
