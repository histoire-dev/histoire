import type { HistoireSearchResult } from '@histoire/protocol'
import type { WorkbenchSearchState } from '../../../../histoire-app/src/app/components/panes/search/controller.js'
import { describe, expect, it, vi } from 'vitest'
import { shallowRef } from 'vue'
import { createWorkbenchSearchController } from '../../../../histoire-app/src/app/components/panes/search/controller.js'
import { sourceFixture } from '../../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { createHistoireSessionWithAdapters } from '../../../../histoire-sdk/src/internal.js'

/**
 * Connects one session whose source answers catalog search with `result`.
 * @param result Ranked source result returned for every search request.
 */
async function connectedSession(result: HistoireSearchResult) {
  const fixture = sourceFixture()
  const request = fixture.request.getMockImplementation()!
  fixture.request.mockImplementation((command, payload) => command === 'catalog.search' ? Promise.resolve([result]) : request(command, payload))
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
  await session.connect()
  await session.selection.select({ storyId: 'a:b', variantId: 'c' })
  return { fixture, session }
}

/**
 * Ready adapter state supplies prop names through production runtime ownership checks.
 * @param result Ranked source result returned for every search request.
 * @param propName Optional runtime prop name published by the mounted document.
 * @param bound Search through an unmounted canonical session bound to the mounted runtime owner, like canvas frames.
 */
async function searchOwner(result: HistoireSearchResult, propName?: string, bound = false) {
  const { fixture, session } = await connectedSession(result)
  await session.mount({} as HTMLElement, { surface: 'preview' }).ready
  /** Derived definitions arrive from runtime; host state.patch must reject them. */
  function setProp(name?: string) {
    const state = fixture.state()
    for (const listener of fixture.frameListeners) listener({ type: 'state', ...fixture.owner(), state: { ...state, value: { ...state.value, _hPropDefs: name ? [{ name: 'Button', props: [{ name, types: ['boolean'] }] }] : [] } } })
  }
  setProp(propName)
  let state: WorkbenchSearchState | undefined
  const canonical = bound ? (await connectedSession(result)).session : session
  // Mirrors the standalone runtime binding: canonical route session plus the selected frame's snapshot.
  const runtime = { snapshot: shallowRef(session.getSnapshot()) }
  const stopRuntime = session.subscribe(value => runtime.snapshot.value = value)
  const controller = createWorkbenchSearchController(canonical, value => state = value, bound ? runtime : undefined)
  return {
    fixture,
    session,
    controller,
    getState: () => state!,
    setProp,
    /** Release controller before retiring caller-owned sessions. */
    async close() {
      controller.close()
      stopRuntime()
      await session.dispose()
      if (canonical !== session) await canonical.dispose()
    },
  }
}

const source = { target: { storyId: 'a:b', variantId: null }, kind: 'story' as const, title: 'Disabled controls', rank: 0 }

describe('workbench source and prop relevance', () => {
  it.each([0, 1])('merges exact props with source relevance %s without changing source rank', async (score) => {
    const owner = await searchOwner({ ...source, title: score === 0 ? 'Disabled' : source.title, match: { mode: 'literal', score } }, 'disabled')
    vi.useFakeTimers()
    try {
      owner.controller.search('disabled')
      await vi.advanceTimersByTimeAsync(50)
      expect(owner.getState().results.map(result => result.kind)).toEqual(score === 0 ? ['story', 'prop'] : ['prop', 'story'])
      expect(owner.getState().results.find(result => result.source)?.source?.rank).toBe(0)
    }
    finally {
      await owner.close()
      vi.useRealTimers()
    }
  })

  it('suppresses local fuzzy props when source has a literal match', async () => {
    const owner = await searchOwner({ ...source, match: { mode: 'literal', score: 1 } }, 'disabld')
    vi.useFakeTimers()
    try {
      owner.controller.search('disabled')
      await vi.advanceTimersByTimeAsync(50)
      expect(owner.getState().results.map(result => result.title)).toEqual(['Disabled controls'])
    }
    finally {
      await owner.close()
      vi.useRealTimers()
    }
  })

  it('suppresses source fallback for later literal props and restores retained candidates without another request', async () => {
    const owner = await searchOwner({ ...source, match: { mode: 'fuzzy', score: 4.1 } })
    vi.useFakeTimers()
    try {
      owner.controller.search('disabled')
      await vi.advanceTimersByTimeAsync(50)
      expect(owner.getState().results.map(result => result.title)).toEqual(['Disabled controls'])
      await owner.setProp('disabled')
      expect(owner.getState().results.map(result => result.title)).toEqual(['disabled'])
      await owner.setProp()
      expect(owner.getState().results.map(result => result.title)).toEqual(['Disabled controls'])
      expect(owner.fixture.request.mock.calls.filter(([command]) => command === 'catalog.search')).toHaveLength(1)
    }
    finally {
      await owner.close()
      vi.useRealTimers()
    }
  })

  it('indexes props of the bound runtime owner when canonical session has no runtime', async () => {
    const owner = await searchOwner({ ...source, match: { mode: 'fuzzy', score: 4.1 } }, 'disabled', true)
    vi.useFakeTimers()
    try {
      owner.controller.search('disabled')
      await vi.advanceTimersByTimeAsync(50)
      expect(owner.getState().results.map(result => [result.kind, result.title])).toEqual([['prop', 'disabled']])
      owner.setProp('enabled')
      owner.controller.search('enabled')
      await vi.advanceTimersByTimeAsync(50)
      expect(owner.getState().results.map(result => [result.kind, result.title])).toContainEqual(['prop', 'enabled'])
    }
    finally {
      await owner.close()
      vi.useRealTimers()
    }
  })
})
