import type { HistoireSourceSearchData } from '@histoire/protocol'
import { describe, expect, it } from 'vitest'
import { searchEmbedData } from '../../../../../histoire-app/src/embed/search.js'
import { createSearchFixture } from '../utils/search.js'

describe('source search relevance', () => {
  it.each(['intro', 'Introduction', '  INTRODUCTION  '])('finds document without unrelated fuzzy titles for %s', (query) => {
    const { data, document } = createSearchFixture()
    expect(searchEmbedData(data, query)).toEqual([expect.objectContaining({
      kind: 'docs',
      title: 'Introduction',
      target: { storyId: document.id, variantId: null },
      rank: 0,
      match: { mode: 'literal', score: query.trim().length === 5 ? 1 : 0 },
    })])
  })

  it('uses conservative typo fallback only without literal hits', () => {
    const { data } = createSearchFixture()
    expect(searchEmbedData(data, 'intrduction')).toEqual([expect.objectContaining({ title: 'Introduction', match: { mode: 'fuzzy', score: expect.any(Number) } })])
    for (const query of ['', ' \n ', 'zzzzzzzzzz', 'evnt']) expect(searchEmbedData(data, query)).toEqual([])
  })

  it('ranks title tiers before full-body matches and assigns stable global ranks', () => {
    const row = (storyId: string, title: string, text = title, kind: 'story' | 'docs' = 'story') => ({ target: { storyId, variantId: null }, kind, title, text })
    const data: HistoireSourceSearchData = {
      titles: [row('substring', 'My Button'), row('prefix', 'Button examples'), row('exact', 'Button'), row('context', 'Small', 'Button small'), row('equal', 'Button examples')],
      docs: [row('body', 'Guide', `${'Leading words '.repeat(100)}Button \n  reference`, 'docs')],
    }
    const results = searchEmbedData(data, 'button')
    expect(results.map(result => result.target.storyId)).toEqual(['exact', 'prefix', 'equal', 'substring', 'context', 'body'])
    expect(results.map(result => result.rank)).toEqual([0, 1, 2, 3, 4, 5])
    expect(searchEmbedData(data, 'button reference')).toMatchObject([{ target: { storyId: 'body' }, match: { mode: 'literal', score: 3 } }])
  })

  it('keeps ordinary story and documentation actions separate without duplicate documents', () => {
    const { data } = createSearchFixture()
    const title = data.titles[0]
    const results = searchEmbedData({ ...data, docs: [...data.docs, { ...title, kind: 'docs', text: 'EventButton documentation' }] }, 'EventButton')
    expect(results.filter(result => result.target.storyId === title.target.storyId).map(result => result.kind)).toEqual(['story', 'docs'])
  })
})
