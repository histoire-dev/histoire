import { describe, expect, it } from 'vitest'
import { validateHistoireCatalogStory } from '../bridge/catalog.js'
import { getHistoireFiniteMatrixValues, normalizeHistoireMatrixHint } from '../helpers/matrix.js'

describe('finite matrix metadata', () => {
  const story = { id: 'button', title: 'Button', docsOnly: false, path: ['Button'], variants: [], content: { docs: false, rawSource: true } }

  it('projects typed finite scalars and rejects internal prop names', () => {
    expect(normalizeHistoireMatrixHint({ axes: { size: ['sm', 'sm', 1, true, null, Infinity, {}], _hPropState: [true] } })).toEqual({ axes: { size: ['sm', 1, true, null] } })
    expect(validateHistoireCatalogStory({ ...story, matrix: { axes: { size: ['sm', 'md'] } } }).matrix?.axes.size).toEqual(['sm', 'md'])
  })

  it('refuses non-finite, executable or internal values at wire boundary', () => {
    for (const axes of [{ size: [Infinity] }, { size: [() => {}] }, { _hPropState: [true] }]) {
      expect(() => validateHistoireCatalogStory({ ...story, matrix: { axes } })).toThrow('Invalid matrix values')
    }
  })

  it('requires complete finite automatic domains while preserving typed identities', () => {
    expect(getHistoireFiniteMatrixValues([1, '1', 1, false, null])).toEqual([1, '1', false, null])
    for (const domain of [['valid', {}], [true, undefined], [1, Infinity], Array.from({ length: 65 }, (_, index) => index)]) {
      expect(getHistoireFiniteMatrixValues(domain)).toBeUndefined()
    }
  })
})
