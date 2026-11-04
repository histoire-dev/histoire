import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStoriesState } from '../../../../../histoire-cli/src/terminal/stories/state.js'
import { settleTimers } from '../utils/flush.js'
import { createCatalogHarness } from './catalog-harness.js'

type Harness = Awaited<ReturnType<typeof createCatalogHarness>>

/** Zero padded IDs sort in numeric order, so page positions are predictable. */
const numbered = (count: number, prefix = 's') => Array.from({ length: count }, (_, index) => ({ id: `${prefix}${String(index).padStart(3, '0')}` }))

describe('stories state', () => {
  let harness: Harness
  beforeEach(async () => {
    harness = await createCatalogHarness()
  })
  afterEach(async () => {
    await harness.close()
  })

  it('never mixes pages of two revisions when an old page is delivered after the catalog changed', async () => {
    await harness.publish(numbered(250))
    harness.ready()
    const state = createStoriesState(harness)
    await vi.waitFor(() => expect(state.view().stories).toHaveLength(100))
    const before = state.view().revision

    // Page two of the old revision is computed, then held while the catalog is edited.
    const release = harness.holdNext()
    const held = state.moreStories()
    await harness.publish(numbered(3, 'new'))
    await vi.waitFor(() => expect(state.view().stories.map(story => story.id)).toEqual(['new000', 'new001', 'new002']))
    release()
    await held
    await settleTimers(10)
    const view = state.view()
    expect(view.revision).not.toBe(before)
    expect(view.stories.map(story => story.id)).toEqual(['new000', 'new001', 'new002'])
    expect(view.hasMore).toBe(false)
    state.dispose()
  })

  it('restarts from the first page when a continuation turns out to be stale', async () => {
    await harness.publish(numbered(250))
    harness.ready()
    // No revision events reach this state: only the child's refusal can tell it the catalog moved.
    const state = createStoriesState({ ...harness, bridge: { send: harness.bridge.send, subscribe: () => () => {} } })
    await vi.waitFor(() => expect(state.view().stories).toHaveLength(100))
    await harness.publish(numbered(120, 'x'))
    await state.moreStories()
    await vi.waitFor(() => expect(state.view().stories).toHaveLength(100))
    expect(state.view().stories.every(story => story.id.startsWith('x'))).toBe(true)
    expect(state.view().total).toBe(120)
    expect(harness.calls.filter(call => call.operation === 'catalog.list')).toHaveLength(3)
    state.dispose()
  })

  it('keeps loading until the selected story is present again after a revision change', async () => {
    await harness.publish(numbered(250))
    harness.ready()
    const state = createStoriesState(harness)
    state.keepVisible(() => 's230', () => undefined)
    await vi.waitFor(() => expect(state.view().stories.some(story => story.id === 's230')).toBe(true))
    await harness.publish([...numbered(250), { id: 's999' }])
    await vi.waitFor(() => expect(state.view().total).toBe(251))
    await vi.waitFor(() => expect(state.view().stories.some(story => story.id === 's230')).toBe(true))
    state.dispose()
  })

  it('drops every row when the generation goes away and ignores a late answer of the old one', async () => {
    await harness.publish([{ id: 'old' }])
    harness.ready('g1')
    const state = createStoriesState(harness)
    await vi.waitFor(() => expect(state.view().stories).toHaveLength(1))

    const release = harness.holdNext()
    state.refresh()
    harness.restarting()
    expect(state.view()).toMatchObject({ status: 'waiting', stories: [], total: 0, catalog: undefined })

    await harness.publish([{ id: 'fresh' }])
    harness.ready('g2')
    release()
    await vi.waitFor(() => expect(state.view().stories.map(story => story.id)).toEqual(['fresh']))
    expect(state.view().generation).toBe('g2')
    state.dispose()
  })

  it('lists variants of the opened story on the revision of its stories and clears them when the story is removed', async () => {
    await harness.publish([{ id: 'a', variants: ['one', 'two'] }, { id: 'b', variants: ['three'] }])
    harness.ready()
    const state = createStoriesState(harness)
    await vi.waitFor(() => expect(state.view().stories).toHaveLength(2))
    state.openStory('b')
    await vi.waitFor(() => expect(state.variants().variants.map(variant => variant.id)).toEqual(['three']))
    expect(state.variants().revision).toBe(state.view().revision)

    await harness.publish([{ id: 'a', variants: ['one'] }])
    await vi.waitFor(() => expect(state.variants()).toMatchObject({ status: 'failed', variants: [] }))
    expect(state.variants().problem).toMatch(/not found/i)
    state.dispose()
  })
})
