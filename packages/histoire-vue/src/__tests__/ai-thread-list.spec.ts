import type { UiAiThread } from '@histoire/shared'
import type { AiThreads } from '../../../histoire-app/src/app/stores/ai-threads.js'
import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { HistoireProvider } from '@histoire/vue'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { h, ref } from 'vue'
import AiThreadList from '../../../histoire-app/src/app/components/panes/ai/AiThreadList.vue'
import { sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { commentFixture } from '../../../histoire/src/node/__tests__/utils/comments.js'

/** Pinned thread on the fixture catalog's selected story. */
const pinned = commentFixture({ title: 'Pinned here', context: { storyId: 'a:b', variantId: 'c' } })
/** Free-form thread with the selected story as context. */
const storyThread = commentFixture({ title: 'About this story', context: { storyId: 'a:b' }, anchor: undefined })
/** Free-form thread without context. */
const projectThread = commentFixture({ title: 'New story', context: undefined, anchor: undefined })
/** Pinned thread on another story. */
const otherPinned = commentFixture({ title: 'Pinned elsewhere', context: { storyId: 'a', variantId: 'b:c' } })
/** Pinned thread whose story was removed. */
const orphan = commentFixture({ title: 'Orphan', context: { storyId: 'gone', variantId: 'x' } })

/** Mount the list inside a session whose selection is story `a:b`. */
async function mountList(threads: UiAiThread[], showArchived = false) {
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, sourceFixture().adapters)
  await session.connect()
  await session.selection.select({ storyId: 'a:b', variantId: 'c' })
  const open = vi.fn()
  const selectPin = vi.fn()
  const model = { visible: ref(threads), threads: ref(threads), showArchived: ref(showArchived), available: ref(true), activeId: ref(null), open, compose: vi.fn() } as unknown as AiThreads
  const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(AiThreadList, { model, agents: [], onSelectPin: selectPin }) }, global: { stubs: { BuiltinIcon: true, AgentLogo: true } } })
  await flushPromises()
  return { wrapper, open, selectPin,
    /** Rows of one group, by heading. */
    group(title: string) {
      return wrapper.findAll('section').find(section => section.get('h3').text() === title)!.findAll('button')
    },
    /** Teardown. */
    async close() {
      wrapper.unmount()
      await session.dispose()
    } }
}

describe('aI thread list', () => {
  it('groups threads of the selected story first, then the rest of the project', async () => {
    const list = await mountList([projectThread, pinned, otherPinned, storyThread, orphan])
    try {
      expect(list.wrapper.findAll('h3').map(heading => heading.text())).toEqual(['This story', 'Project'])
      expect(list.group('This story').map(row => row.text())).toEqual([expect.stringContaining('Pinned here'), expect.stringContaining('About this story')])
      expect(list.group('Project').map(row => row.text())).toEqual([expect.stringContaining('New story'), expect.stringContaining('Pinned elsewhere'), expect.stringContaining('Orphan')])
      // Pin numbers are ordinals among pinned threads in persisted order.
      expect(list.group('This story')[0].get('[data-pin]').text()).toBe('1')
      expect(list.group('Project')[1].get('[data-pin]').text()).toBe('2')
      expect(list.group('Project')[2].get('[data-pin]').text()).toBe('3')
    }
    finally { await list.close() }
  })

  it('asks to open a pinned thread on the canvas and opens other threads in the pane', async () => {
    const list = await mountList([pinned, storyThread, orphan])
    try {
      await list.group('This story')[0].trigger('click')
      expect(list.selectPin).toHaveBeenCalledWith(pinned.id)
      expect(list.open).not.toHaveBeenCalled()
      await list.group('This story')[1].trigger('click')
      expect(list.open).toHaveBeenLastCalledWith(storyThread.id)
      await list.group('Project')[0].trigger('click')
      expect(list.open).toHaveBeenLastCalledWith(orphan.id)
      expect(list.selectPin).toHaveBeenCalledOnce()
    }
    finally { await list.close() }
  })

  it('explains an empty archive without offering a new thread', async () => {
    const list = await mountList([], true)
    try {
      expect(list.wrapper.text()).toContain('No archived threads')
      expect(list.wrapper.find('button').exists()).toBe(false)
    }
    finally { await list.close() }
  })
})
