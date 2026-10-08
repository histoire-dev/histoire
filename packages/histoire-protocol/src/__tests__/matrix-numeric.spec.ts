import { describe, expect, it } from 'vitest'
import { getHistoireNumericMatrixValues } from '../helpers/matrix-numeric.js'
import { normalizeHistoireMatrixHint } from '../helpers/matrix.js'

describe('numeric story matrix ranges', () => {
  it('validates whole numeric lists, including sparse input, before accepting samples', () => {
    expect(getHistoireNumericMatrixValues([-0, 0, 2, 2, 1])).toEqual([0, 2, 1])
    for (const values of [[1], [1, '2'], [1, Number.NaN], [1, Infinity], Object.assign([], { 0: 1, 2: 2 }), Array.from({ length: 65 }, (_, index) => index)]) {
      expect(getHistoireNumericMatrixValues(values)).toBeUndefined()
    }
  })

  it.each([
    [{ min: 0, max: 20, step: 5 }, [0, 5, 10, 15, 20]],
    [{ min: -2, max: 2, step: 1 }, [-2, -1, 0, 1, 2]],
    [{ min: 0, max: 10, step: 3 }, [0, 3, 6, 9]],
    [{ min: 0, max: 0.3, step: 0.1 }, [0, 0.1, 0.2, 0.3]],
    [{ min: 1e-7, max: 3e-7, step: 1e-7 }, [1e-7, 2e-7, 3e-7]],
    [{ min: -0, max: 0, step: 1 }, [0]],
  ])('projects %j into exact finite catalog values', (range, values) => {
    const hint = normalizeHistoireMatrixHint({ axes: { count: range, enabled: [false, true] } })!
    expect(hint.axes).toEqual({ count: values, enabled: [false, true] })
    expect(Object.isFrozen(hint.axes.count)).toBe(true)
    expect(Object.isFrozen(hint)).toBe(true)
  })

  it('ignores invalid ranges without losing other explicit axes', () => {
    for (const range of [
      { min: 0, max: 2, step: 0 },
      { min: 0, max: 2, step: -1 },
      { min: 2, max: 0, step: 1 },
      { min: 0, max: Infinity, step: 1 },
      { min: 0, max: 64, step: 1 },
      { min: 0, max: 1 },
    ]) {
      expect(normalizeHistoireMatrixHint({ axes: { count: range, enabled: [false, true] } })).toEqual({ axes: { enabled: [false, true] } })
    }
    expect(normalizeHistoireMatrixHint({ axes: { count: { min: 0, max: 63, step: 1 } } })?.axes.count).toHaveLength(64)
  })
})
