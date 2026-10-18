import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { describe, expect, it } from 'vitest'
import { createShell, SHELL_STORAGE_KEY } from '../../../histoire-app/src/app/stores/shell.js'
import { sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { mountSourceDrawer } from './fixtures/source-drawer.js'

describe('source expansion preference', () => {
  it('retains both choices through fresh shells without losing other preferences', () => {
    window.localStorage.setItem(SHELL_STORAGE_KEY, JSON.stringify({ pane: 'search', panelOpen: true, inspectorOpen: false, panelWidth: 310, inspectorWidth: 380 }))
    let shell = createShell({ dev: true, storage: window.localStorage })
    try {
      expect(shell.sourceExpanded.value).toBe(false)
      for (const expanded of [true, false]) {
        shell.toggleSource()
        shell.close()
        shell = createShell({ dev: true, storage: window.localStorage })
        expect(shell.sourceExpanded.value).toBe(expanded)
        expect(shell.pane.value).toBe('search')
        expect(shell.inspectorOpen.value).toBe(false)
        expect(shell.panelWidth.value).toBe(310)
        expect(shell.inspectorWidth.value).toBe(380)
      }
      shell.close()
      shell.toggleSource()
      expect(shell.sourceExpanded.value).toBe(false)
    }
    finally {
      shell.close()
      window.localStorage.removeItem(SHELL_STORAGE_KEY)
    }
  })

  it.each([undefined, 'true', 1, null])('defaults invalid saved value %s to collapsed and tolerates failed writes', (sourceExpanded) => {
    const shell = createShell({ dev: false, storage: {
      getItem: () => JSON.stringify({ sourceExpanded }),
      setItem: () => { throw new Error('Storage blocked') },
    } })
    try {
      expect(shell.sourceExpanded.value).toBe(false)
      shell.toggleSource()
      expect(shell.sourceExpanded.value).toBe(true)
    }
    finally { shell.close() }
  })

  it('keeps expansion across source remounts, selections, and shell navigation', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    const shell = createShell({ dev: true })
    const other = createShell({ dev: true })
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    let wrapper = mountSourceDrawer(session, {}, shell)
    try {
      expect(wrapper.get('[aria-label="Expand source"]').attributes('aria-expanded')).toBe('false')
      await wrapper.get('[aria-label="Expand source"]').trigger('click')
      expect(wrapper.get('[aria-label="Source mode"]').exists()).toBe(true)
      for (const target of [{ storyId: 'a:b', variantId: 'other' }, { storyId: 'a', variantId: 'b:c' }]) {
        await session.selection.select(target)
        wrapper.unmount()
        wrapper = mountSourceDrawer(session, {}, shell)
        expect(wrapper.get('[aria-label="Collapse source"]').attributes('aria-expanded')).toBe('true')
      }
      expect(other.sourceExpanded.value).toBe(false)
      shell.toggleInspector()
      shell.selectPane('home')
      shell.setNarrow(390)
      shell.toggleInspector()
      shell.selectPane('stories')
      expect(shell.sourceExpanded.value).toBe(true)
      await wrapper.findAll('button').find(button => button.text() === 'Source')!.trigger('click')
      wrapper.unmount()
      wrapper = mountSourceDrawer(session, {}, shell)
      expect(wrapper.get('[aria-label="Expand source"]').attributes('aria-expanded')).toBe('false')
      expect(wrapper.find('[aria-label="Source mode"]').exists()).toBe(false)
    }
    finally {
      wrapper.unmount()
      shell.close()
      other.close()
      await session.dispose()
    }
  })
})
