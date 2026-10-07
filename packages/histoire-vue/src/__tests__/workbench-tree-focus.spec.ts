import type { HistoireTarget } from '@histoire/protocol'
import { BuiltinIcon } from '@histoire/controls/vue'
import { getHistoireTargetKey } from '@histoire/protocol'
import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import StoriesPanel from '../../../histoire-app/src/app/components/panes/stories/StoriesPanel.vue'
import { createContextMenu, provideContextMenu } from '../../../histoire-app/src/app/composables/context-menu.js'
import { createStandaloneFolders } from '../../../histoire-app/src/app/standalone/folders.js'
import { createUiSettingsStore, provideUiSettingsStore } from '../../../histoire-app/src/app/stores/settings.js'
import { deferred, sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { HistoireProvider } from '../provider/HistoireProvider.js'
import { virtualViewport } from './fixtures/virtual-viewport.js'

vi.mock('@histoire/vue/internal', () => import('../internal.js'))
vi.mock('virtual:$histoire-config', () => ({ config: { theme: { title: 'Stories' } }, logos: {} }))
afterEach(() => vi.restoreAllMocks())

/** Real catalog/session and production tree own navigation; only layout is supplied. */
async function tree(density: 'comfortable' | 'compact', options: { count?: number, variants?: { id: string, title: string }[], primary?: boolean, prepare?: (fixture: ReturnType<typeof sourceFixture>) => void, onError?: (error: unknown) => void, onFit?: (target: HistoireTarget) => void } = {}) {
  const fixture = sourceFixture()
  options.prepare?.(fixture)
  const prototype = fixture.descriptor.catalog.stories[0]
  fixture.descriptor.catalog.stories = Array.from({ length: options.count ?? 1000 }, (_, index) => ({ ...prototype, id: `story-${index}`, title: `Story ${index}`, variants: options.variants ?? [{ id: 'default', title: 'Default' }] }))
  fixture.descriptor.catalog.tree = fixture.descriptor.catalog.stories.map(story => ({ kind: 'story', storyId: story.id, title: story.title }))
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
  await session.connect()
  if (options.primary) await session.mount(document.createElement('div'), { surface: 'preview' }).ready
  await session.selection.select({ storyId: 'story-0', variantId: 'default' })
  const folders = createStandaloneFolders(session, window)
  const settings = createUiSettingsStore({})
  const menu = createContextMenu()
  settings.update({ density })
  const Owner = defineComponent({
    setup() {
      provideUiSettingsStore(settings)
      provideContextMenu(menu)
      return () => h(HistoireProvider, { session }, { default: () => h(StoriesPanel, { folders, onError: options.onError, onFit: options.onFit }) })
    },
  })
  const wrapper = mount(Owner, { attachTo: document.body })
  return {
    wrapper,
    session,
    fixture,
    menu,
    /** Retire DOM resources before their canonical session. */
    async close() {
      wrapper.unmount()
      folders.close()
      await session.dispose()
    },
  }
}

describe('production story tree keyboard focus', () => {
  it.each([
    { icon: 'mdi:tailwind', expected: 'mdi:tailwind' },
    { icon: undefined, expected: 'cube' },
  ])('uses story icon $expected', async ({ icon, expected }) => {
    const owner = await tree('comfortable', {
      count: 1,
      prepare: (fixture) => {
        if (icon) fixture.descriptor.catalog.stories[0].icon = icon
      },
    })
    try {
      await vi.waitFor(() => expect(owner.wrapper.findAll('[role=treeitem]').length).toBeGreaterThan(0))
      const row = owner.wrapper.get('[data-test-id="story-list-item"]')
      expect(row.findAllComponents(BuiltinIcon).map(component => component.props('icon'))).toContain(expected)
    }
    finally { await owner.close() }
  })

  it('opens shared frame menu for variants without changing selection', async () => {
    const owner = await tree('comfortable', {
      count: 1,
      variants: [{ id: 'default', title: 'Default' }, { id: 'other', title: 'Other' }],
    })
    try {
      await vi.waitFor(() => expect(owner.wrapper.text()).toContain('Other'))
      const other = owner.wrapper.findAll('[role=treeitem]').find(row => row.text() === 'Other')!
      const selection = { storyId: 'story-0', variantId: 'other' }
      const frame = { ...selection, frameKey: getHistoireTargetKey(selection) }
      const pointer = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 80 })
      other.element.dispatchEvent(pointer)
      await nextTick()
      expect(pointer.defaultPrevented).toBe(true)
      expect(owner.menu.state.target).toEqual(frame)
      expect(owner.menu.state.context).toEqual({
        kind: 'frame',
        label: 'story-0 › other',
        frame,
        selection,
      })
      expect(owner.session.getSnapshot().selection).toEqual({ storyId: 'story-0', variantId: 'default' })

      const keyboard = new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true, cancelable: true })
      other.element.dispatchEvent(keyboard)
      await nextTick()
      expect(keyboard.defaultPrevented).toBe(true)
      expect(owner.menu.state.target).toEqual(frame)
    }
    finally { await owner.close() }
  })

  it('scrolls an explicitly revealed selected variant into the virtual list', async () => {
    const viewport = virtualViewport(true)
    const owner = await tree('comfortable')
    try {
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      const scroller = owner.wrapper.get('.vue-recycle-scroller').element as HTMLElement
      scroller.scrollTop = 0
      viewport.deliverScroll()

      const target = { storyId: 'story-999', variantId: 'default' }
      await owner.session.selection.select(target)
      await vi.waitFor(() => expect(owner.session.getSnapshot().selection).toEqual(target))
      await nextTick()
      const targetKey = JSON.stringify(['variant', target.storyId, target.variantId])
      expect(owner.wrapper.findAll('[data-tree-key]').some(row => row.attributes('data-tree-key') === targetKey)).toBe(false)

      const stories = owner.wrapper.findComponent(StoriesPanel).vm as unknown as {
        revealVariant: (value: typeof target) => Promise<void>
      }
      await stories.revealVariant(target)
      viewport.deliverScroll()

      await vi.waitFor(() => expect(owner.wrapper.findAll('[data-tree-key]').some(row => row.attributes('data-tree-key') === targetKey)).toBe(true))
      expect(scroller.scrollTop).toBeGreaterThan(0)
      expect(owner.session.getSnapshot().selection).toEqual(target)

      const storyKey = JSON.stringify(['story', target.storyId])
      const story = owner.wrapper.findAll('[data-tree-key]').find(row => row.attributes('data-tree-key') === storyKey)!
      await story.trigger('keydown', { key: 'ArrowLeft' })
      await nextTick()
      expect(owner.wrapper.findAll('[data-tree-key]').some(row => row.attributes('data-tree-key') === targetKey)).toBe(false)

      await stories.revealVariant(target)
      viewport.deliverScroll()
      await vi.waitFor(() => expect(owner.wrapper.findAll('[data-tree-key]').some(row => row.attributes('data-tree-key') === targetKey)).toBe(true))
      expect(owner.session.getSnapshot().selection).toEqual(target)
    }
    finally {
      await owner.close()
    }
  })

  it('emits exact variant target on double-click without changing ordinary selection', async () => {
    const fit = vi.fn()
    const owner = await tree('comfortable', {
      count: 1,
      variants: [{ id: 'default', title: 'Default' }, { id: 'other', title: 'Other' }],
      onFit: fit,
    })
    try {
      await vi.waitFor(() => expect(owner.wrapper.text()).toContain('Other'))
      const story = owner.wrapper.findAll('[role=treeitem]').find(row => row.text().includes('Story 0'))!
      const other = owner.wrapper.findAll('[role=treeitem]').find(row => row.text() === 'Other')!
      await other.trigger('click')
      await vi.waitFor(() => expect(owner.session.getSnapshot().selection).toEqual({ storyId: 'story-0', variantId: 'other' }))
      expect(fit).not.toHaveBeenCalled()
      await other.trigger('dblclick')
      expect(fit).toHaveBeenCalledOnce()
      expect(fit).toHaveBeenCalledWith({ storyId: 'story-0', variantId: 'other' })
      await story.trigger('dblclick')
      expect(fit).toHaveBeenCalledOnce()
    }
    finally { await owner.close() }
  })

  it.each(['comfortable', 'compact'] as const)('keeps %s End/Home focus when native scroll events arrive later', async (density) => {
    const viewport = virtualViewport(true)
    const owner = await tree(density)
    try {
      // Settle the recycler's initial viewport discovery before initiating navigation.
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      await nextTick()
      const firstKey = JSON.stringify(['story', 'story-0'])
      const lastKey = JSON.stringify(['story', 'story-999'])
      const first = owner.wrapper.findAll('[role="treeitem"]').find(row => row.attributes('data-tree-key') === firstKey)!
      ;(first.element as HTMLElement).focus()
      await first.trigger('keydown', { key: 'End' })
      // Original reveal waited its own RAF before the browser's scroll event.
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      viewport.deliverScroll()
      await vi.waitFor(() => expect(owner.wrapper.findAll('[role="treeitem"]').some(row => row.attributes('data-tree-key') === lastKey)).toBe(true))
      expect(document.activeElement?.getAttribute('data-tree-key')).toBe(lastKey)
      expect(owner.session.getSnapshot().selection).toEqual({ storyId: 'story-0', variantId: 'default' })
      expect(owner.wrapper.findAll('[role="treeitem"]').length).toBeLessThan(35)
      await owner.wrapper.findAll('[role="treeitem"]').find(row => row.attributes('data-tree-key') === lastKey)!.trigger('keydown', { key: 'Home' })
      viewport.deliverScroll()
      await vi.waitFor(() => expect(document.activeElement?.getAttribute('data-tree-key')).toBe(firstKey))
      expect(owner.session.getSnapshot().selection).toEqual({ storyId: 'story-0', variantId: 'default' })
    }
    finally { await owner.close() }
  })

  it('keeps a Tab entry after ordinary scrolling without taking external focus, then reveals and activates focused variant', async () => {
    const viewport = virtualViewport(true)
    const owner = await tree('comfortable')
    const outside = document.createElement('button')
    document.body.append(outside)
    try {
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      const focusedKey = JSON.stringify(['variant', 'story-0', 'default'])
      outside.focus()
      const scroller = owner.wrapper.get('.vue-recycle-scroller').element as HTMLElement
      scroller.scrollTop = 15_000
      viewport.deliverScroll()
      await vi.waitFor(() => expect(owner.wrapper.findAll('[role=treeitem]').some(row => row.attributes('data-tree-key') === focusedKey)).toBe(false))
      expect(document.activeElement).toBe(outside)
      const tree = owner.wrapper.get('[role=tree]')
      expect(tree.attributes('tabindex')).toBe('0')
      ;(tree.element as HTMLElement).focus()
      await vi.waitFor(() => expect(document.activeElement?.getAttribute('data-tree-key')).toBe(focusedKey))
      await owner.wrapper.findAll('[role=treeitem]').find(row => row.attributes('data-tree-key') === focusedKey)!.trigger('keydown', { key: 'Enter' })
      await vi.waitFor(() => expect(owner.session.getSnapshot().selection).toEqual({ storyId: 'story-0', variantId: 'default' }))
    }
    finally {
      outside.remove()
      await owner.close()
    }
  })

  it('suppresses retired selection rejection but reports rejection for current selection', async () => {
    const errors: unknown[] = []
    const first = deferred<unknown>()
    let otherReply: Promise<unknown> = first.promise
    const owner = await tree('comfortable', {
      count: 1,
      variants: [{ id: 'default', title: 'Default' }, { id: 'other', title: 'Other' }],
      primary: true,
      onError: error => errors.push(error),
      prepare(fixture) {
        const request = fixture.request.getMockImplementation()!
        fixture.request.mockImplementation((command, payload) => command === 'selection.select' && payload.variantId === 'other' ? otherReply : request(command, payload))
      },
    })
    try {
      await vi.waitFor(() => expect(owner.wrapper.text()).toContain('Other'))
      const other = owner.wrapper.findAll('[role=treeitem]').find(row => row.text() === 'Other')!
      const current = owner.wrapper.findAll('[role=treeitem]').find(row => row.text() === 'Default')!
      await other.trigger('click')
      await current.trigger('click')
      await vi.waitFor(() => expect(owner.session.getSnapshot().selection).toEqual({ storyId: 'story-0', variantId: 'default' }))
      await new Promise<void>(resolve => setTimeout(resolve, 0))
      expect(errors).toEqual([])

      const failure = new Error('Current selection')
      const currentFailure = deferred<unknown>()
      otherReply = currentFailure.promise
      await other.trigger('click')
      currentFailure.reject(failure)
      await vi.waitFor(() => expect(errors).toEqual([failure]))
    }
    finally {
      first.resolve(undefined)
      await owner.close()
    }
  })
})
