import { describe, expect, it } from 'vitest'
import { layoutMatrixFrames } from '../../../histoire-app/src/app/components/canvas/matrix/matrix-layout.js'
import { createMatrixStore } from '../../../histoire-app/src/app/stores/matrix.js'
import { formatMatrixCustomValues, normalizeMatrixCustomValues, parseMatrixCustomValues } from '../../../histoire-app/src/app/util/matrix-values.js'
import { discoverMatrixProps, expandMatrixCells, filterMatrixValues, matrixCellKey } from '../../../histoire-app/src/app/util/matrix.js'
import { createEmbedSnapshot } from '../../../histoire/src/node/__tests__/utils/embed/catalog.js'

/** Local storage boundary exposes exact persisted records without replacing store behavior. */
function storageFixture(initial?: unknown) {
  const records = new Map<string, string>(initial ? [['_histoire-ui-matrix/a:b', JSON.stringify(initial)]] : [])
  return { records, storage: { getItem: (key: string) => records.get(key) ?? null, setItem: (key: string, value: string) => {
    records.set(key, value)
  } } }
}

describe('custom matrix JSON domains', () => {
  it('preserves typed values, deduplicates structural objects, and detaches frozen domains', () => {
    const input = [{ b: [1, -0], a: true }, { a: true, b: [1, 0] }, [1, 2], [2, 1], 1, '1', null]
    const values = normalizeMatrixCustomValues(input)
    expect(values).toEqual([{ a: true, b: [1, 0] }, [1, 2], [2, 1], 1, '1', null])
    ;(input[0] as { b: number[] }).b[0] = 9
    expect(values[0]).toEqual({ a: true, b: [1, 0] })
    expect(Object.isFrozen(values)).toBe(true)
    expect(Object.isFrozen(values[0])).toBe(true)
    expect(() => parseMatrixCustomValues('[1,]')).toThrow()
  })

  it('parses one value per line, keeps JSON literals typed, and accepts pasted JSON arrays', () => {
    expect(parseMatrixCustomValues('red\n  green \n\n')).toEqual(['red', 'green'])
    expect(parseMatrixCustomValues('1\n"1"\ntrue\nnull\n{"b":1,"a":2}\n[1]\n"  padded "')).toEqual([1, '1', true, null, { a: 2, b: 1 }, [1], '  padded '])
    expect(parseMatrixCustomValues('[\n  "red",\n  "green"\n]')).toEqual(['red', 'green'])
  })

  it('formats values back into lines that parse to the same domain', () => {
    const values = normalizeMatrixCustomValues(['red', '1', 'true', '', ' x', 'a\nb', '"q"', '[1', '2]', 1, false, null, { a: 1 }, [2]])
    const text = formatMatrixCustomValues(values)
    expect(text.split('\n').slice(0, 2)).toEqual(['red', '"1"'])
    expect(parseMatrixCustomValues(text)).toEqual(values)
    expect(parseMatrixCustomValues(formatMatrixCustomValues(['[1', '2]']))).toEqual(['[1', '2]'])
  })

  it('rejects invalid complete domains instead of sanitizing or truncating them', () => {
    const accessor = Object.defineProperty({}, 'value', { enumerable: true, get() {
      throw new Error('Getter ran')
    } })
    const cycle: unknown[] = []
    cycle.push(cycle)
    for (const input of [[1], [1, 1], [1, Infinity], [1, undefined], [1, () => {}], [1, accessor], [1, cycle], [1, new Date()], [1, Object.assign([], { 1: 2 })], Array.from({ length: 65 }, (_, i) => i), [1, 'x'.repeat(65_536)], [1, JSON.parse('{"__proto__":1}')]]) {
      expect(() => normalizeMatrixCustomValues(input)).toThrow()
    }
  })

  it('uses structural values for filters, stable keys, layout and isolated cell props', () => {
    const rows = { name: 'item', values: normalizeMatrixCustomValues([{ a: 1, b: 2 }, { a: 2 }]) }
    const cols = { name: 'list', values: normalizeMatrixCustomValues([[1, 2], [2, 1]]) }
    expect(filterMatrixValues(rows, [{ b: 2, a: 1 }])).toEqual([{ a: 1, b: 2 }])
    expect(matrixCellKey('story', 'n', 1, 's', '1')).toBe('["story","n",1,"s","1"]')
    const base = { theme: { contrast: 1 } }
    const cells = expandMatrixCells('story', rows, cols, base)
    expect(matrixCellKey('story', 'item', { b: 2, a: 1 }, 'list', [1, 2])).toBe(cells[0].key)
    const frames = layoutMatrixFrames(JSON.parse(JSON.stringify(cells)), { storyId: 'story', variantId: 'base', rows: rows.values, cols: cols.values, size: { width: 100, height: 100 }, zoom: 1 })
    expect(frames.map(frame => [frame.x, frame.y])).toEqual([[128, 28], [244, 28], [128, 144], [244, 144]])
    ;(cells[0].props.item as { a: number }).a = 9
    expect(cells[1].props.item).toEqual({ a: 1, b: 2 })
    expect(rows.values[0]).toEqual({ a: 1, b: 2 })
    ;(cells[0].props.theme as { contrast: number }).contrast = 2
    expect(cells[1].props.theme).toEqual({ contrast: 1 })
    expect(base.theme).toEqual({ contrast: 1 })
  })
})

describe('custom matrix axes and persistence', () => {
  it('adds missing domains, preserves edits across stories and reload, and restores defaults', () => {
    const { storage, records } = storageFixture()
    const store = createMatrixStore({ storage })
    const base = { item: { label: 'Canonical' }, text: 'Original' }
    store.activate('a:b', [], base)
    store.setCustomAxis(' item ', [{ label: 'First' }, { label: 'Second' }])
    store.setCustomAxis('manual', [[1], [2]])
    expect(store.rows.value).toBe('item')
    expect(store.cols.value).toBe('manual')
    expect(store.cells.value.map(cell => [cell.props.item, cell.props.manual])).toEqual([[{ label: 'First' }, [1]], [{ label: 'First' }, [2]], [{ label: 'Second' }, [1]], [{ label: 'Second' }, [2]]])
    expect(base).toEqual({ item: { label: 'Canonical' }, text: 'Original' })
    store.setFilter('rows', [{ label: 'Second' }])
    store.swapAxes()
    store.activate('other', [], {})
    expect(store.axes.value).toEqual([])
    store.close()
    const restored = createMatrixStore({ storage })
    restored.activate('a:b', [], base, {}, [], undefined, false)
    expect(restored.rows.value).toBe('manual')
    expect(restored.cells.value).toHaveLength(2)
    restored.activate('a:b', [{ name: 'item', values: ['default', 'latest'] }], { text: 'New preset' })
    expect(restored.cells.value[0].props.item).toEqual({ label: 'Second' })
    restored.removeCustomAxis('item')
    expect(restored.colAxis.value?.values).toEqual(['default', 'latest'])
    expect(restored.cells.value).toHaveLength(4)
    expect(JSON.parse(records.get('_histoire-ui-matrix/a:b')!).customAxes).toEqual({ manual: [[1], [2]] })
    restored.removeCustomAxis('manual')
    expect(restored.available.value).toBe(false)
    expect(restored.rows.value || restored.cols.value).toBe('item')
    restored.close()
  })

  it('leaves unavailable structured defaults to component runtime without evaluating factories', () => {
    const store = createMatrixStore()
    const fields = discoverMatrixProps({ _hPropDefs: [{ props: [{ name: 'item', types: ['object'], default: '() => ({ label: \'Original\' })' }, { name: 'list', types: ['array'], default: '() => [0]' }] }] })
    store.activate('a:b', [{ name: 'enabled', values: [false, true] }, { name: 'count', values: [0, 1] }], Object.fromEntries(fields.map(prop => [prop.name, prop.value])), {}, [], fields)
    expect(store.cells.value[0].props).toEqual({ enabled: false, count: 0 })
    store.setCustomAxis('item', [{ label: 'First' }, { label: 'Second' }])
    expect(store.axes.value.find(axis => axis.name === 'item')?.values).toEqual([{ label: 'First' }, { label: 'Second' }])
    store.close()
  })

  it('overrides numeric defaults, routes numeric editing to custom entry and preserves invalid edits atomically', () => {
    const { storage, records } = storageFixture()
    const store = createMatrixStore({ storage })
    store.activate('a:b', [{ name: 'count', values: [0, 10] }, { name: 'enabled', values: [false, true] }], {})
    store.setNumericValues('count', [1, 2])
    store.setCustomAxis('count', [3, 4])
    store.setNumericValues('count', [5, 6])
    const saved = records.get('_histoire-ui-matrix/a:b')!
    expect(JSON.parse(saved).customAxes.count).toEqual([5, 6])
    expect(JSON.parse(saved).numericValues.count).toBeUndefined()
    for (const name of ['', ' ', '_hInternal', '__proto__', 'constructor']) expect(() => store.setCustomAxis(name, [1, 2])).toThrow()
    expect(() => store.setCustomAxis('count', [1])).toThrow()
    expect(records.get('_histoire-ui-matrix/a:b')).toBe(saved)
    expect(store.axes.value.find(axis => axis.name === 'count')?.values).toEqual([5, 6])
    store.setFilter(store.rows.value === 'count' ? 'rows' : 'cols', [])
    store.resetNumericValues('count')
    expect(store.cells.value).toHaveLength(4)
    expect(store.axes.value.find(axis => axis.name === 'count')?.values).toEqual([0, 10])
    store.close()
  })

  it('validates entries independently and enforces candidate and payload limits atomically', () => {
    const { storage, records } = storageFixture({ rows: 'item', cols: 'flag', base: { text: 'Edited' }, customAxes: { item: [{ a: 1 }, { a: 2 }], invalid: [1], _hUnsafe: [1, 2] }, numericValues: { count: [2, 3] } })
    const store = createMatrixStore({ storage })
    store.activate('a:b', [{ name: 'flag', values: [false, true] }, { name: 'count', values: [0, 1] }], {})
    expect(store.rowAxis.value?.values).toEqual([{ a: 1 }, { a: 2 }])
    expect(store.base.value.text).toBe('Edited')
    expect(store.axes.value.find(axis => axis.name === 'count')?.values).toEqual([2, 3])
    const hints = Array.from({ length: 32 }, (_, i) => ({ name: `axis${i}`, values: [0, 1] }))
    store.activate('a:b', hints, {}, {}, hints.map(axis => axis.name))
    const previous = records.get('_histoire-ui-matrix/a:b')
    expect(() => store.setCustomAxis('new', [1, 2])).toThrow('32')
    expect(records.get('_histoire-ui-matrix/a:b')).toBe(previous)
    store.activate('a:b', [{ name: 'flag', values: [false, true] }], { large: 'x'.repeat(60_000) })
    expect(store.axes.value.some(axis => axis.name === 'item')).toBe(true)
    expect(() => store.setCustomAxis('item', ['x'.repeat(10_000), 'small'])).toThrow()
    store.close()
  })

  it('retains custom values while metadata is pending and rejects retired publications', () => {
    const snapshot = createEmbedSnapshot()
    snapshot.selection = { storyId: 'a:b', variantId: 'c' }
    const store = createMatrixStore()
    store.synchronize(snapshot)
    store.setCustomAxis('manual', [{ a: 1 }, { a: 2 }])
    store.setCustomAxis('list', [[1], [2]])
    const observer = store.registerRuntimeObserver()
    observer.close()
    snapshot.runtime = { ...snapshot.runtime, status: 'ready', runtimeId: 'retired' }
    snapshot.state = { target: snapshot.selection, runtimeId: 'retired', value: { manual: 'Original' } }
    observer.capture(snapshot)
    expect(store.cells.value).toHaveLength(4)
    store.synchronize(snapshot)
    expect(store.cells.value[0].props.manual).toEqual({ a: 1 })
    expect(snapshot.state.value).toEqual({ manual: 'Original' })
    store.close()
  })

  it('reserves custom capacity ahead of automatic axes and restores source-excluded entries', () => {
    const { storage, records } = storageFixture()
    const store = createMatrixStore({ storage })
    const automatic = Array.from({ length: 32 }, (_, i) => ({ name: `auto${i}`, values: [false, true] }))
    store.activate('a:b', automatic, {})
    store.setCustomAxis('item', [{ a: 1 }, { a: 2 }])
    expect(store.axes.value).toHaveLength(32)
    expect(store.axes.value.some(axis => axis.name === 'item')).toBe(true)
    expect(store.axes.value.some(axis => axis.name === 'auto31')).toBe(false)
    store.activate('a:b', automatic, {}, {}, automatic.map(axis => axis.name))
    expect(store.axes.value.some(axis => axis.name === 'item')).toBe(false)
    // Updating an existing saved entry cannot consume additional capacity.
    store.setCustomAxis('item', [{ a: 3 }, { a: 4 }])
    expect(JSON.parse(records.get('_histoire-ui-matrix/a:b')!).customAxes.item).toEqual([{ a: 3 }, { a: 4 }])
    store.activate('a:b', automatic, {})
    expect(store.axes.value.find(axis => axis.name === 'item')?.values).toEqual([{ a: 3 }, { a: 4 }])
    store.close()
  })

  it('rejects combined storage overflow and invalidates copy when JSON cell props change', async () => {
    const { storage, records } = storageFixture()
    const store = createMatrixStore({ storage })
    store.activate('a:b', [], {})
    store.setCustomAxis('item', [{ a: 1 }, { a: 2 }])
    store.setCustomAxis('list', [[1], [2]])
    store.selectCell(store.cells.value[0].key)
    let finish!: (source: string) => void
    const release = store.registerSource(store.cells.value[0].key, () => new Promise(resolve => finish = resolve))
    const pending = store.sourceForSelected()
    store.setBase('message', 'Changed')
    finish('<Component />')
    await expect(pending).rejects.toThrow('Selected matrix cell changed')
    release()
    store.setCustomAxis('item', ['x'.repeat(40_000), 'small'])
    const saved = records.get('_histoire-ui-matrix/a:b')
    expect(() => store.setCustomAxis('list', ['y'.repeat(40_000), 'small'])).toThrow()
    expect(records.get('_histoire-ui-matrix/a:b')).toBe(saved)
    store.close()
  })
})
