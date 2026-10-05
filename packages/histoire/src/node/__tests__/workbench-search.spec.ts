import type { HistoireCatalogStory, HistoireSearchResult } from '@histoire/protocol'
import type { WorkbenchSearchState } from '../../../../histoire-app/src/app/components/panes/search/controller.js'
import { describe, expect, it, vi } from 'vitest'
import { createWorkbenchSearchController } from '../../../../histoire-app/src/app/components/panes/search/controller.js'
import { getSearchActivationResult, getSearchFrameMatches, matchLoadedProps, projectSearchResults, readPropNames } from '../../../../histoire-app/src/app/components/panes/search/query.js'
import { deferred, sourceFixture } from '../../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { createHistoireSessionWithAdapters } from '../../../../histoire-sdk/src/internal.js'

const story: HistoireCatalogStory = { id: 'story:one', title: 'Button', path: ['UI', 'Button'], docsOnly: false, variants: [{ id: 'size:small', title: 'Small' }, { id: 'size:large', title: 'Large' }], content: { docs: true, rawSource: true } }

describe('workbench search projections', () => {
  it('keeps source ranking and exact IDs without building another title index', () => {
    const source: HistoireSearchResult[] = [
      { target: { storyId: story.id, variantId: 'size:large' }, kind: 'variant', title: 'Large', rank: 0 },
      { target: { storyId: story.id, variantId: null }, kind: 'story', title: 'Button', rank: 1 },
    ]
    expect(projectSearchResults(source, [story]).map(result => result.source)).toEqual(source)
    expect(projectSearchResults(source, [story])[0].path).toEqual(['UI', 'Button'])
  })

  it('places docs-only title hits in Docs scope and activates Docs without mutating ranked source', () => {
    const docs = { ...story, id: 'guide', docsOnly: true, variants: [] }
    const source: HistoireSearchResult = { target: { storyId: docs.id, variantId: null }, kind: 'story', title: 'Guide', rank: 4, anchor: '#welcome' }
    const results = projectSearchResults([source], [docs])
    expect(results).toMatchObject([{ kind: 'docs', source }])
    expect(getSearchFrameMatches(results, docs)).toEqual([])
    expect(getSearchActivationResult(results[0])).toEqual({ ...source, kind: 'docs' })
    expect(source.kind).toBe('story')
  })

  it('indexes only usable loaded prop definitions and preserves target ownership', () => {
    const names = readPropNames({ _hPropDefs: [{ name: 'Button', props: [{ name: 'disabled', types: ['boolean'] }, { name: 'size', types: ['string'] }, { name: 8 }] }, null] })
    const results = matchLoadedProps([{ target: { storyId: story.id, variantId: 'size:small' }, names }], [story], 'disable')
    expect(results).toMatchObject([{ kind: 'prop', title: 'disabled', excerpt: 'Button · boolean', target: { storyId: story.id, variantId: 'size:small' } }])
    expect(matchLoadedProps([{ target: { storyId: 'removed', variantId: 'size:small' }, names }], [story], 'disable')).toEqual([])
  })

  it('maps story matches to all variant frames while keeping variants and props exact', () => {
    const source = projectSearchResults([{ target: { storyId: story.id, variantId: null }, kind: 'story', title: 'Button', rank: 0 }], [story])
    expect(getSearchFrameMatches(source, story)).toEqual(['["story:one","size:small"]', '["story:one","size:large"]'])
    const props = matchLoadedProps([{ target: { storyId: story.id, variantId: 'size:large' }, names: [{ name: 'size', component: 'Button', types: [] }] }], [story], 'size')
    expect(getSearchFrameMatches(props, story)).toEqual(['["story:one","size:large"]'])
    expect(getSearchFrameMatches(source, undefined)).toEqual([])
  })
})

describe('workbench search request ownership', () => {
  it('debounces requests and ignores earlier query completion', async () => {
    vi.useFakeTimers()
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    const first = deferred<readonly HistoireSearchResult[]>()
    const second = deferred<readonly HistoireSearchResult[]>()
    fixture.request.mockImplementation((_command, payload) => payload.query === 'first' ? first.promise : second.promise)
    let state: WorkbenchSearchState | undefined
    const controller = createWorkbenchSearchController(session, value => state = value)
    try {
      controller.search('unused')
      controller.search('first')
      await vi.advanceTimersByTimeAsync(50)
      controller.search('second')
      await vi.advanceTimersByTimeAsync(50)
      second.resolve([{ target: { storyId: 'a:b', variantId: 'c' }, kind: 'variant', title: 'Second', rank: 0 }])
      await vi.advanceTimersByTimeAsync(0)
      expect(state?.results.map(result => result.title)).toEqual(['Second'])
      first.resolve([{ target: { storyId: 'a:b', variantId: 'c' }, kind: 'variant', title: 'First', rank: 0 }])
      await vi.advanceTimersByTimeAsync(0)
      expect(state?.results.map(result => result.title)).toEqual(['Second'])
      expect(fixture.request.mock.calls.map(([, payload]) => payload.query)).toEqual(['first', 'second'])
    }
    finally {
      controller.close()
      await session.dispose()
      vi.useRealTimers()
    }
  })

  it('preserves known title results for failed repeated query without retaining failed docs', async () => {
    vi.useFakeTimers()
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    fixture.request.mockResolvedValue([{ target: { storyId: 'a:b', variantId: 'c' }, kind: 'variant', title: 'First', rank: 0 }, { target: { storyId: 'a:b', variantId: null }, kind: 'docs', title: 'Docs', rank: 1 }])
    let state: WorkbenchSearchState | undefined
    const controller = createWorkbenchSearchController(session, value => state = value)
    try {
      controller.search('needle')
      await vi.advanceTimersByTimeAsync(50)
      fixture.request.mockRejectedValue(new Error('Docs index unavailable'))
      controller.search('needle')
      await vi.advanceTimersByTimeAsync(50)
      expect(state?.results.map(result => result.title)).toEqual(['First'])
      expect(state?.error).toMatchObject({ message: 'Docs index unavailable' })
      controller.search('')
      await vi.advanceTimersByTimeAsync(50)
      expect(state?.results).toEqual([])
    }
    finally {
      controller.close()
      await session.dispose()
      vi.useRealTimers()
    }
  })
})
