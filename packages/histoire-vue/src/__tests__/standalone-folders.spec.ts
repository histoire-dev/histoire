import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { createStandaloneFolders } from '../../../histoire-app/src/app/standalone/folders.js'
import { sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { HistoireStoryTree } from '../components/tree/HistoireStoryTree.js'
import { HistoireProvider } from '../provider/HistoireProvider.js'

describe('standalone folder adapter', () => {
  it('retains folded preferences across settings updates and opens known deep-link ancestors', async () => {
    const fixture = sourceFixture()
    const story = fixture.descriptor.catalog.stories[0]
    story.path = ['Nested', story.title]
    fixture.descriptor.catalog.tree = [{ kind: 'folder', title: 'Nested', children: [{ kind: 'story', storyId: story.id, title: story.title }] }]
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    window.localStorage.removeItem('_histoire-tree-state')
    const folders = createStandaloneFolders(session, window)
    const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(HistoireStoryTree, { showVariants: false, foldersInitiallyOpen: false, expandedPaths: folders.expandedPaths.value, onFolder: folders.toggle }) } })
    try {
      expect(wrapper.find('[aria-label="First"]').exists()).toBe(false)
      const details = wrapper.get('details')
      ;
      (details.element as HTMLDetailsElement).open = true
      await details.trigger('toggle')
      expect(wrapper.find('[aria-label="First"]').exists()).toBe(true)
      expect(JSON.parse(window.localStorage.getItem('_histoire-tree-state')!)).toEqual([['Nested', true]])
      ;
      (details.element as HTMLDetailsElement).open = false
      await details.trigger('toggle')
      await session.settings.update({ colorScheme: 'dark' })
      expect(wrapper.find('[aria-label="First"]').exists()).toBe(false)
      await session.selection.select({ storyId: story.id, variantId: 'c' })
      await vi.waitFor(() => expect(wrapper.find('[aria-label="First"]').exists()).toBe(true))
    }
    finally {
      wrapper.unmount()
      folders.close()
      await session.dispose()
      window.localStorage.removeItem('_histoire-tree-state')
    }
  })
})
