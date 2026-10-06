import { describe, expect, it } from 'vitest'
import { validateBridgeResult } from '../bridge/results.js'

const result = { target: { storyId: 'intro', variantId: null }, kind: 'docs', title: 'Introduction', rank: 0 }

describe('search result matching evidence', () => {
  it('accepts legacy results and literal/fuzzy relevance', () => {
    for (const match of [undefined, { mode: 'literal', score: 0 }, { mode: 'fuzzy', score: 4.1 }]) {
      expect(() => validateBridgeResult('catalog.search', [{ ...result, ...match ? { match } : {} }])).not.toThrow()
    }
  })

  it.each([null, 'literal', {}, { mode: 'other', score: 1 }, { mode: 'literal', score: -1 }, { mode: 'fuzzy', score: Infinity }, { mode: 'literal', score: '0' }])('rejects malformed matching evidence %j', (match) => {
    expect(() => validateBridgeResult('catalog.search', [{ ...result, match }])).toThrow()
  })
})
