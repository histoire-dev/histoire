import { getHistoireTargetKey } from '@histoire/protocol'
import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { createSearchFrameNavigation, getSearchFrameState } from '../../../histoire-app/src/app/components/panes/search/frame-navigation.js'
import { createCanvasStore } from '../../../histoire-app/src/app/stores/canvas.js'
import { sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'

describe('workbench Search frame navigation', () => {
  it('reveals matching frames in catalog order without mutating canonical runtime or frame selection', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    const collected = session.getSnapshot().catalog.stories[0]
    const story = { ...collected, variants: ['c', 'd', 'e'].map(id => ({ ...collected.variants[0], id, title: id })) }
    const key = (variantId: string) => getHistoireTargetKey({ storyId: story.id, variantId })
    const canvas = createCanvasStore()
    canvas.setZoom(1)
    canvas.setGeometry({ width: 700, height: 600 }, { x: 0, y: 0, width: 3000, height: 500 })
    canvas.selectedFrame = key('c')
    const selected = session.getSnapshot().selection
    const runtime = session.getSnapshot().runtime
    const select = vi.spyOn(session.selection, 'select')
    const reveal = vi.fn((id: string) => {
      canvas.revealFrame({ id, storyId: story.id, variantId: id === key('d') ? 'd' : 'e', x: id === key('d') ? 1200 : 2200, y: 0, width: 400, height: 400 })
      return true
    })
    const navigation = createSearchFrameNavigation({ getStory: () => story, getMatches: () => [key('e'), key('d')], isActive: () => true, getOwner: () => 'query/source', getSelected: () => key('c'), reveal })
    try {
      expect(navigation.position.value).toBe(0)
      navigation.next()
      expect(navigation.position.value).toBe(1)
      navigation.next()
      expect(navigation.position.value).toBe(2)
      navigation.next()
      navigation.previous()
      expect(reveal.mock.calls.map(([id]) => id)).toEqual([key('d'), key('e'), key('d'), key('e')])
      expect(canvas.panOffset.x).toBeLessThan(0)
      expect(canvas.selectedFrame).toBe(key('c'))
      expect(session.getSnapshot().selection).toEqual(selected)
      expect(session.getSnapshot().runtime).toEqual(runtime)
      expect(select).not.toHaveBeenCalled()
    }
    finally {
      navigation.close()
      await session.dispose()
    }
  })

  it('retires query/source cursors and ignores missing frame geometry', () => {
    const state = reactive({ owner: 'first', selected: 'canonical', matches: ['first', 'second'], active: true, available: true })
    const story = { ...sourceFixture().descriptor.catalog.stories[0], id: 'story', variants: [{ id: 'first', title: 'First' }, { id: 'second', title: 'Second' }] }
    const keys = story.variants.map(variant => getHistoireTargetKey({ storyId: story.id, variantId: variant.id }))
    const reveal = vi.fn(() => state.available)
    const navigation = createSearchFrameNavigation({ getStory: () => story, getMatches: () => state.matches.map(value => getHistoireTargetKey({ storyId: story.id, variantId: value })), isActive: () => state.active, getOwner: () => state.owner, getSelected: () => state.selected, reveal })
    navigation.previous()
    expect(reveal).toHaveBeenLastCalledWith(keys[1])
    state.available = false
    navigation.next()
    expect(navigation.position.value).toBe(2)
    state.owner = 'second'
    expect(navigation.position.value).toBe(0)
    state.available = true
    navigation.next()
    state.matches = ['second']
    expect(navigation.position.value).toBe(0)
    state.selected = keys[1]
    expect(navigation.position.value).toBe(1)
    state.active = false
    expect(navigation.count.value).toBe(0)
    navigation.close()
  })

  it('projects exact match state for canonical/passive frames and clears inactive queries', () => {
    expect(getSearchFrameState('match', true, ['match'])).toEqual({ highlighted: true, dimmed: false })
    expect(getSearchFrameState('canonical', true, ['match'])).toEqual({ highlighted: false, dimmed: true })
    expect(getSearchFrameState('canonical', false, ['match'])).toEqual({ highlighted: false, dimmed: false })
    expect(getSearchFrameState(undefined, true, [])).toEqual({ highlighted: false, dimmed: false })
  })
})
