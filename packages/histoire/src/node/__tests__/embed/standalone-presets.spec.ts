import { describe, expect, it } from 'vitest'
import { createStandalonePresetStorage } from '../../../../../histoire-app/src/app/standalone/presets.js'
import { toRawDeep } from '../../../../../histoire-app/src/app/util/state.js'
import { createRuntimeStatePresets } from '../../../../../histoire-app/src/embed/adapters/state-presets.js'
import { createRuntimeState } from '../../../../../histoire-app/src/embed/adapters/state.js'

/** Storage fixture models existing VueUse Map serialization without browser globals. */
function createStorage() {
  const values = new Map<string, string>()
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => {
    values.set(key, value)
  } }
}

describe('standalone runtime preset migration', () => {
  it('loads legacy structured-target keys without transient patches or loss of runtime owners', () => {
    const storage = createStorage()
    const key = '_histoire-presets/story:with:colon:variant:with:colon'
    storage.setItem(`${key}/states`, JSON.stringify([['legacy', { label: 'Remembered', state: { count: 7, nested: { label: 'saved' } } }]]))
    storage.setItem(`${key}/selected`, 'legacy')
    const callback = () => 'runtime'
    const state = { count: 1, nested: { label: 'initial', callback }, _hPropDefs: ['derived'] }
    const serialize = (value: any) => toRawDeep(value, true)
    const runtime = createRuntimeState(() => state, serialize)
    runtime.capture()
    const presets = createRuntimeStatePresets(() => state, serialize, createStandalonePresetStorage(() => storage, { storyId: 'story:with:colon', variantId: 'variant:with:colon' }))
    expect(state.count).toBe(1)
    presets.restoreSelected()
    expect(state.count).toBe(7)
    expect(state.nested.callback).toBe(callback)
    expect(state._hPropDefs).toEqual(['derived'])
    expect(presets.execute({ action: 'list' })).toEqual({ items: [{ id: 'legacy', label: 'Remembered' }], selectedId: 'legacy' })
    presets.execute({ action: 'rename', id: 'legacy', label: 'Renamed' })
    expect(JSON.parse(storage.getItem(`${key}/states`)!)[0][1].label).toBe('Renamed')
    runtime.reset()
    presets.clearSelection()
    expect(state.count).toBe(1)
    expect(storage.getItem(`${key}/selected`)).toBe('default')
    state.count = 9
    presets.restoreSelected()
    expect(state.count).toBe(9)
  })

  it('ignores invalid entries and tolerates denied storage or cyclic unsavable presets', () => {
    const storage = createStorage()
    storage.setItem('_histoire-presets/s:v/states', JSON.stringify([['bad', { label: '', state: {} }], ['good', { label: 'Good', state: { count: 3 } }], ['array', { label: 'Array', state: [] }]]))
    const persistence = createStandalonePresetStorage(() => storage, { storyId: 's', variantId: 'v' })
    expect(persistence.load().items.map(item => item.id)).toEqual(['good'])
    const denied = createStandalonePresetStorage(() => {
      throw new Error('SecurityError')
    }, { storyId: 's', variantId: 'v' })
    expect(denied.load()).toEqual({ items: [] })
    expect(() => denied.save({ items: [] })).not.toThrow()
    const cycle: any = { count: 1 }
    cycle.self = cycle
    persistence.save({ items: [{ id: 'cycle', label: 'Cycle', value: cycle }], selectedId: 'cycle' })
    expect(persistence.load()).toEqual({ items: [] })
    expect(storage.getItem('_histoire-presets/s:v/selected')).toBe('default')
  })
})
