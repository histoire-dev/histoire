import { describe, expect, it } from 'vitest'
import { createMatrixStore } from '../../../histoire-app/src/app/stores/matrix.js'
import { discoverMatrixAxes } from '../../../histoire-app/src/app/util/matrix.js'
import { createEmbedSnapshot } from '../../../histoire/src/node/__tests__/utils/embed/catalog.js'

/** Ready numeric metadata uses the existing source/target fixture. */
function numericSnapshot() {
  const snapshot = createEmbedSnapshot()
  snapshot.selection = { storyId: 'a:b', variantId: 'c' }
  snapshot.runtime = { ...snapshot.runtime, status: 'ready', runtimeId: 'numeric-runtime' }
  snapshot.state = { target: { ...snapshot.selection }, runtimeId: 'numeric-runtime', value: {
    _hPropDefs: [{ props: [{ name: 'count', types: ['number'] }, { name: 'enabled', types: ['boolean'] }] }],
    count: 7,
    enabled: false,
  } }
  return snapshot
}

describe('numeric matrix domains and saved edits', () => {
  it('samples exclusive numeric declarations and unowned finite root state safely', () => {
    const state = Object.defineProperty({ level: 3, nested: { amount: 1 }, invalid: Infinity, mixed: 5 }, 'getter', {
      enumerable: true,
      get() { throw new Error('Getter must not run') },
    })
    const definitions = [{ props: [{ name: 'count', types: ['number'] }, { name: 'mixed', types: ['number', 'string'] }] }]
    expect(discoverMatrixAxes(definitions, undefined, state)).toEqual([
      { name: 'count', values: [0, 1, 2, 5, 10] },
      { name: 'level', values: [0, 1, 2, 5, 10] },
    ])
  })

  it('resolves project samples, runtime domains, story hints, and saved overrides in order', () => {
    const snapshot = numericSnapshot()
    const store = createMatrixStore({ numericValues: () => [3, 6, 9] })
    store.synchronize(snapshot)
    expect(store.axes.value.find(axis => axis.name === 'count')?.values).toEqual([3, 6, 9])
    snapshot.state = { ...snapshot.state!, value: { _hPropDefs: [{ props: [{ name: 'count', types: ['number'], values: [4, 8] }, { name: 'enabled', types: ['boolean'] }] }] } }
    store.synchronize(snapshot)
    expect(store.axes.value.find(axis => axis.name === 'count')?.values).toEqual([4, 8])
    snapshot.catalog.stories[0].matrix = { axes: { count: [10, 20] } }
    store.synchronize(snapshot)
    expect(store.axes.value.find(axis => axis.name === 'count')?.values).toEqual([10, 20])
    store.setNumericValues('count', [12, 24])
    expect(store.axes.value.find(axis => axis.name === 'count')?.values).toEqual([12, 24])
    expect(store.cells.value.map(cell => cell.props.count)).toEqual([12, 24, 12, 24])
    expect(snapshot.state.value).toEqual({ _hPropDefs: [{ props: [{ name: 'count', types: ['number'], values: [4, 8] }, { name: 'enabled', types: ['boolean'] }] }] })
    store.resetNumericValues('count')
    expect(store.axes.value.find(axis => axis.name === 'count')?.values).toEqual([10, 20])
    store.close()
  })

  it('keeps overrides by story and prop through swaps, presets, storage reload, and reset', () => {
    const records = new Map<string, string>()
    const storage = {
      getItem: (key: string) => records.get(key) ?? null,
      setItem: (key: string, value: string) => { records.set(key, value) },
    }
    const snapshot = numericSnapshot()
    const store = createMatrixStore({ storage })
    store.synchronize(snapshot)
    store.setFilter('cols', [])
    store.setNumericValues('count', [2, 4, 4, -0])
    expect(store.cells.value).toHaveLength(6)
    store.swapAxes()
    expect(store.rowAxis.value?.values).toEqual([2, 4, 0])
    snapshot.selection!.variantId = 'other'
    snapshot.state = { ...snapshot.state!, target: { ...snapshot.selection! } }
    store.synchronize(snapshot)
    expect(store.rowAxis.value?.values).toEqual([2, 4, 0])
    store.activate('second', [{ name: 'count', values: [6, 8] }, { name: 'enabled', values: [false, true] }], {})
    expect(store.axes.value.find(axis => axis.name === 'count')?.values).toEqual([6, 8])
    store.close()
    const restored = createMatrixStore({ storage })
    restored.synchronize(snapshot)
    expect(restored.rowAxis.value?.values).toEqual([2, 4, 0])
    restored.setFilter('rows', [4])
    restored.selectCell(restored.cells.value[0].key)
    restored.resetNumericValues('count')
    expect(restored.rowAxis.value?.values).toEqual([0, 1, 2, 5, 10])
    expect(restored.cells.value).toHaveLength(10)
    expect(restored.selectedCell.value).toBeUndefined()
    expect(JSON.parse(records.get('_histoire-ui-matrix/a:b')!).numericValues).toEqual({})
    restored.close()
  })

  it('restores valid preference entries and rejects invalid edits atomically', () => {
    let saved = JSON.stringify({ rows: 'enabled', cols: 'count', base: { message: 'Edited' }, numericValues: { count: [8, 16], invalid: [1], enabled: [2, 3], removed: [2, 3] } })
    const store = createMatrixStore({ storage: {
      getItem: () => saved,
      setItem: (_key, value) => { saved = value },
    } })
    store.synchronize(numericSnapshot())
    expect(store.colAxis.value?.values).toEqual([8, 16])
    expect(store.rowAxis.value?.values).toEqual([false, true])
    expect(store.axes.value.some(axis => axis.name === 'removed')).toBe(false)
    expect(store.base.value.message).toBe('Edited')
    const previous = saved
    for (const values of [[1], [Infinity, 2], Array.from({ length: 65 }, (_, index) => index)]) {
      expect(() => store.setNumericValues('count', values)).toThrow('2–64 distinct finite numbers')
    }
    expect(saved).toBe(previous)
    expect(store.colAxis.value?.values).toEqual([8, 16])
    store.close()
  })

  it('preserves saved edits while numeric metadata is pending or removed', () => {
    const store = createMatrixStore()
    const snapshot = numericSnapshot()
    snapshot.catalog.stories[0].runtimeRevision = 'numeric-v1'
    store.synchronize(snapshot)
    store.setNumericValues('count', [11, 22])
    snapshot.state = null
    snapshot.runtime.status = 'mounting'
    snapshot.catalog.stories[0].runtimeRevision = 'numeric-v2'
    store.synchronize(snapshot)
    expect(store.metadataReady.value).toBe(false)
    const ready = numericSnapshot()
    ready.catalog.stories[0].runtimeRevision = 'numeric-v2'
    store.synchronize(ready)
    expect(store.axes.value.find(axis => axis.name === 'count')?.values).toEqual([11, 22])
    ready.state = { ...ready.state!, value: { enabled: true } }
    store.synchronize(ready)
    expect(store.axes.value.some(axis => axis.name === 'count')).toBe(false)
    ready.state = numericSnapshot().state
    store.synchronize(ready)
    expect(store.axes.value.find(axis => axis.name === 'count')?.values).toEqual([11, 22])
    store.close()
  })
})
