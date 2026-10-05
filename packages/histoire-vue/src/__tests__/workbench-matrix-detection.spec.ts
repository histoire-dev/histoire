import { describe, expect, it } from 'vitest'
import { createMatrixStore } from '../../../histoire-app/src/app/stores/matrix.js'
import { discoverMatrixAxes, resolveMatrixAxisPair } from '../../../histoire-app/src/app/util/matrix.js'

describe('automatic matrix domains', () => {
  it('detects pure Boolean declarations and own root state without guessing open domains', () => {
    const definitions = [{ props: [
      { name: 'enabled', types: ['boolean'] },
      { name: 'mixed', types: ['boolean', 'string'] },
      { name: 'message', types: ['string'], value: 'Hello', default: 'World' },
      { name: 'count', types: ['number'], default: 5 },
    ] }]
    expect(discoverMatrixAxes(definitions, undefined, { emphasized: true, mixed: false, count: 1, nested: { active: true }, _hPrivate: false })).toEqual([
      { name: 'enabled', values: [false, true] },
      { name: 'emphasized', values: [false, true] },
    ])
    expect(discoverMatrixAxes(undefined, undefined, [false, true])).toEqual([])
    const getter = Object.defineProperty({}, 'computed', { enumerable: true, get: () => {
      throw new Error('Getter must not run')
    } })
    expect(discoverMatrixAxes(undefined, undefined, getter)).toEqual([])
  })

  it('keeps first component ownership even when later duplicate metadata is finite', () => {
    const definitions = [{ props: [{ name: 'value', types: ['string'] }] }, { props: [{ name: 'value', types: ['boolean'] }] }]
    expect(discoverMatrixAxes(definitions, undefined, { value: true })).toEqual([])
    expect(discoverMatrixAxes(definitions, { axes: { value: ['first', 'second'] } })).toEqual([{ name: 'value', values: ['first', 'second'] }])
  })

  it('preserves typed finite values and rejects incomplete or oversized automatic domains', () => {
    const definitions = [{ props: [
      { name: 'finite', values: [1, '1', null, false, 1] },
      { name: 'invalid', values: ['small', {}, 'large'] },
      { name: 'infinite', values: [1, Number.POSITIVE_INFINITY] },
      { name: 'oversized', values: Array.from({ length: 65 }, (_, index) => index) },
      { name: 'empty', values: [] },
    ] }]
    expect(discoverMatrixAxes(definitions)).toEqual([{ name: 'finite', values: [1, '1', null, false] }])
  })

  it('lets explicit hints override automatic domains and advertise extra axes', () => {
    expect(discoverMatrixAxes([{ props: [{ name: 'enabled', types: ['boolean'] }] }], { axes: { enabled: [true, null], size: ['small', 'large'] } })).toEqual([
      { name: 'enabled', values: [true, null] },
      { name: 'size', values: ['small', 'large'] },
    ])
  })

  it('reserves bounded capacity for explicit hints before automatic overflow', () => {
    const definitions = [{ props: Array.from({ length: 32 }, (_, index) => ({ name: `flag${index}`, types: ['boolean'] })) }]
    const hints = { axes: { size: ['small', 'large'], tone: ['light', 'dark'] } }
    const axes = discoverMatrixAxes(definitions, hints)
    expect(axes).toHaveLength(32)
    expect(axes.map(axis => axis.name)).toEqual([...Array.from({ length: 30 }, (_, index) => `flag${index}`), 'size', 'tone'])
    expect(resolveMatrixAxisPair(axes, {}, {}, Object.keys(hints.axes))).toEqual({ rows: 'size', cols: 'tone' })
  })

  it('prefers independent URL choices, saved choices, hints, then small stable domains', () => {
    const axes = [{ name: 'large', values: [1, 2, 3, 4] }, { name: 'first', values: [false, true] }, { name: 'second', values: [false, true] }, { name: 'hinted', values: [1, 2, 3] }]
    expect(resolveMatrixAxisPair(axes)).toEqual({ rows: 'first', cols: 'second' })
    expect(resolveMatrixAxisPair(axes, {}, {}, ['hinted'])).toEqual({ rows: 'hinted', cols: 'first' })
    expect(resolveMatrixAxisPair(axes, { rows: 'missing', cols: 'large' }, { rows: 'second', cols: 'first' }, ['hinted'])).toEqual({ rows: 'second', cols: 'large' })
    expect(resolveMatrixAxisPair(axes, { rows: 'first', cols: 'first' }, { rows: 'second', cols: 'large' })).toEqual({ rows: 'first', cols: 'large' })
  })

  it('requires two usable axes and preserves saved choices while metadata is pending', () => {
    const saved = JSON.stringify({ rows: 'second', cols: 'first', base: { message: 'Edited' }, rowValues: [] })
    const writes: string[] = []
    const store = createMatrixStore({ storage: { getItem: () => saved, setItem: (_key, value) => writes.push(value) } })
    store.activate('story', [], {})
    expect(writes).toEqual([])
    expect(store.rows.value).toBe('second')
    expect(store.base.value.message).toBe('Edited')
    store.activate('story', [{ name: 'single', values: [true] }, { name: 'first', values: [false, true] }], {})
    expect(store.available.value).toBe(false)
    expect(writes).toEqual([])
    store.activate('story', [{ name: 'first', values: [false, true] }, { name: 'second', values: [false, true] }], {})
    expect(store.rows.value).toBe('second')
    expect(store.cols.value).toBe('first')
    expect(store.cells.value).toEqual([])
    store.setFilter('rows', [true])
    store.activate('story', [{ name: 'first', values: [false, true] }, { name: 'second', values: [false, null] }], {})
    expect(store.rowValues.value).toEqual([])
    expect(store.cells.value).toEqual([])
    store.activate('story', [{ name: 'first', values: [false, true] }, { name: 'second', values: [false, true] }], {}, { cols: 'second' })
    expect(store.cols.value).toBe('second')
    expect(store.rows.value).toBe('first')
    store.close()
  })
})
