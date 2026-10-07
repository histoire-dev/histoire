import { describe, expect, it } from 'vitest'
import { getGridColumnCount, getVirtualRowRange, groupTokenRows } from './token-window'

describe('token virtual rows', () => {
  it('keeps measured variable row sizes in the native scroll extent', () => {
    expect(getVirtualRowRange([100, 200, 300, 400], 250, 140, 0)).toEqual({
      start: 1,
      end: 3,
      offsetTop: 100,
      offsetBottom: 400,
      totalSize: 1000,
    })
  })

  it('uses estimates for unmeasured rows and reaches final row', () => {
    expect(getVirtualRowRange([0, 200, 0], 100, 250, 0, 100)).toEqual({
      start: 1,
      end: 3,
      offsetTop: 100,
      offsetBottom: 0,
      totalSize: 400,
    })
    expect(getVirtualRowRange([100, 200, 300, 400], 800, 200, 0)).toEqual({
      start: 3,
      end: 4,
      offsetTop: 600,
      offsetBottom: 0,
      totalSize: 1000,
    })
  })

  it('handles empty and short collections without phantom spacers', () => {
    expect(getVirtualRowRange([], 0, 400, 2)).toEqual({ start: 0, end: 0, offsetTop: 0, offsetBottom: 0, totalSize: 0 })
    expect(getVirtualRowRange([40, 60], 0, 400, 2)).toEqual({ start: 0, end: 2, offsetTop: 0, offsetBottom: 0, totalSize: 100 })
  })

  it('reflows responsive columns without changing token order or identity', () => {
    const tokens = ['a', 'b', 'c', 'd', 'e'].map(key => ({ key }))

    expect(getGridColumnCount(400, 180)).toBe(2)
    expect(getGridColumnCount(720, 180)).toBe(3)
    expect(groupTokenRows(tokens, 3).map(row => row.tokens.map(token => token.key))).toEqual([['a', 'b', 'c'], ['d', 'e']])
    expect(groupTokenRows(tokens, 2).map(row => row.tokens.map(token => token.key))).toEqual([['a', 'b'], ['c', 'd'], ['e']])
    expect(groupTokenRows(tokens, 3)[0].key).not.toBe(groupTokenRows(tokens, 2)[0].key)
  })
})
