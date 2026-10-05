import { describe, expect, it, vi } from 'vitest'
import { createEmbedCyclicState, createEmbedSparseArray } from '../../../histoire/src/node/__tests__/utils/embed/state.js'
import { HistoireSdkError, measureWireValue, validateWireValue } from '../index.js'

describe('bounded wire accounting', () => {
  it('counts exact escaped UTF-8 JSON without invoking serializers', () => {
    const values = [null, true, 42, { 'emoji😀': ['\n', '\"', '\uD800', 'é'] }, { shared: { x: 1 } }]
    for (const value of values) {
      expect(measureWireValue(value, { mode: 'json' })).toBe(new TextEncoder().encode(JSON.stringify(value)).length)
    }
    let calls = 0
    const accessor = Object.defineProperty({}, 'value', { enumerable: true, get: () => ++calls })
    expect(() => measureWireValue(accessor)).toThrow(HistoireSdkError)
    const hiddenAccessor = Object.defineProperty({}, 'value', { get: () => ++calls })
    expect(() => measureWireValue(hiddenAccessor)).toThrow(HistoireSdkError)
    expect(() => measureWireValue(Object.defineProperty({}, 'toJSON', { value: () => ++calls }))).toThrow(HistoireSdkError)
    expect(() => measureWireValue({ toJSON: () => ++calls })).toThrow(HistoireSdkError)
    expect(calls).toBe(0)
  })

  it('charges aliases on each JSON occurrence and rejects JSON cycles/state primitives', () => {
    const child = { text: 'same' }
    const value = { one: child, two: child }
    expect(measureWireValue(value)).toBe(new TextEncoder().encode(JSON.stringify(value)).length)
    const cycle = createEmbedCyclicState()
    for (const invalid of [cycle, undefined, 2n, { value: undefined }, new Map(), Infinity]) {
      expect(() => measureWireValue(invalid)).toThrow(expect.objectContaining({ code: 'INVALID_ARGUMENT' }))
    }
  })

  it('visits cyclic state containers once while retaining undefined, BigInt and holes', () => {
    const state = createEmbedCyclicState({ empty: undefined, big: 255n, slots: createEmbedSparseArray(2) })
    // Two containers, six edges including two sparse slots, five keys, scalar leaves.
    expect(measureWireValue(state, { mode: 'state' })).toBe(16 * 2 + 8 * 6 + 17 + 1 + 9)
    expect(() => measureWireValue(state, { mode: 'state', maxBytes: 20 })).toThrow(expect.objectContaining({ code: 'RESULT_TOO_LARGE' }))
  })

  it('counts small signed BigInt with default or large budgets without allocating budget-sized values', () => {
    for (const maxBytes of [undefined, Number.MAX_SAFE_INTEGER]) {
      expect(measureWireValue(0n, { mode: 'state', maxBytes })).toBe(8)
      for (const value of [12n, -12n]) expect(measureWireValue(value, { mode: 'state', maxBytes })).toBe(9)
    }
    expect(validateWireValue({ value: 12n }, { kind: 'request', name: 'state.patch' })).toBe(38)
  })

  it('keeps exact signed BigInt byte boundaries and rejects overflow before formatting', () => {
    expect(measureWireValue(0n, { mode: 'state', maxBytes: 8 })).toBe(8)
    for (const value of [1n, -1n, 255n, -255n]) expect(measureWireValue(value, { mode: 'state', maxBytes: 9 })).toBe(9)
    for (const value of [256n, -256n]) expect(measureWireValue(value, { mode: 'state', maxBytes: 10 })).toBe(10)
    const format = vi.spyOn(BigInt.prototype, 'toString')
    try {
      for (const value of [256n, -256n, 1n << 1000n, -(1n << 1000n)]) {
        expect(() => measureWireValue(value, { mode: 'state', maxBytes: 9 })).toThrow(expect.objectContaining({ code: 'RESULT_TOO_LARGE' }))
      }
      for (const value of [1n, -1n]) expect(() => measureWireValue(value, { mode: 'state', maxBytes: 8 })).toThrow(expect.objectContaining({ code: 'RESULT_TOO_LARGE' }))
      expect(format).not.toHaveBeenCalled()
    }
    finally {
      format.mockRestore()
    }
  })

  it('stops depth, width, sparse length, byte and BigInt growth at configured bounds', () => {
    const deep: any = {}
    let cursor = deep
    for (let index = 0; index < 130; index++) cursor = cursor.next = {}
    const inputs = [deep, createEmbedSparseArray(200_001), { text: 'x'.repeat(100) }, 1n << 1000n, -(1n << 1000n)]
    for (const value of inputs) {
      expect(() => measureWireValue(value, { mode: 'state', maxBytes: 64 })).toThrow(expect.objectContaining({ code: 'RESULT_TOO_LARGE' }))
    }
    expect(() => measureWireValue({ a: {}, b: {} }, { maxContainers: 2 })).toThrow()
    expect(() => measureWireValue({ a: 1, b: 2 }, { maxEdges: 1 })).toThrow()
  })

  it('uses catalog limit instead of generic response limit and state event override', () => {
    const large = { text: 'x'.repeat(1024 * 1024 + 1) }
    expect(() => validateWireValue(large, { kind: 'response', name: 'catalog.list' })).not.toThrow()
    expect(() => validateWireValue(large, { kind: 'response', name: 'docs.get' })).toThrow(expect.objectContaining({ code: 'RESULT_TOO_LARGE' }))
    expect(() => validateWireValue({ text: 'x'.repeat(70_000) }, { kind: 'event', name: 'state.changed' })).not.toThrow()
    expect(() => validateWireValue({ text: 'x'.repeat(70_000) }, { kind: 'event', name: 'events.appended' })).toThrow()
    expect(() => validateWireValue({ message: 'x'.repeat(16_384) }, { kind: 'error', name: 'docs.get' })).toThrow()
  })
})
