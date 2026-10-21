import type { HistoireSession } from '@histoire/sdk'
import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { RecycleScroller } from 'vue-virtual-scroller'
import StoriesPanel from '../../../histoire-app/src/app/components/panes/stories/StoriesPanel.vue'
import { createWorkbenchTestsModel } from '../../../histoire-app/src/app/components/panes/tests/model.js'
import { createContextMenu, provideContextMenu } from '../../../histoire-app/src/app/composables/context-menu.js'
import { createStandaloneFolders } from '../../../histoire-app/src/app/standalone/folders.js'
import { createUiSettingsStore, provideUiSettingsStore } from '../../../histoire-app/src/app/stores/settings.js'
import { sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { HistoireEvents } from '../components/events/HistoireEvents.js'
import { HistoireVirtualList } from '../foundation/VirtualList.js'
import { HistoireProvider } from '../provider/HistoireProvider.js'
import { virtualViewport } from './fixtures/virtual-viewport.js'

vi.mock('@histoire/vue/internal', () => import('../internal.js'))
vi.mock('virtual:$histoire-config', () => ({ config: { theme: { title: 'Stories' } }, logos: {} }))
afterEach(() => vi.restoreAllMocks())

/** Connected real session with one selected variant. */
async function connected() {
  const fixture = sourceFixture()
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
  await session.connect()
  await session.selection.select({ storyId: 'a:b', variantId: 'c' })
  return { fixture, session }
}

/** Settings-only publication replaces the snapshot while catalog and selection keep identity. */
async function unrelatedPublish(session: HistoireSession): Promise<void> {
  const before = session.getSnapshot()
  await session.settings.update({ checkerboard: !before.settings.checkerboard })
  const after = session.getSnapshot()
  expect(after).not.toBe(before)
  expect(after.catalog).toBe(before.catalog)
  await nextTick()
}

describe('session publication memoization', () => {
  it('keeps story tree rows and scroller items when unrelated snapshot fields change', async () => {
    virtualViewport()
    const { session } = await connected()
    const folders = createStandaloneFolders(session, window)
    const Owner = defineComponent({
      setup() {
        provideUiSettingsStore(createUiSettingsStore({}))
        provideContextMenu(createContextMenu())
        return () => h(HistoireProvider, { session }, { default: () => h(StoriesPanel, { folders }) })
      },
    })
    const wrapper = mount(Owner, { attachTo: document.body })
    try {
      await nextTick()
      const items = wrapper.getComponent(HistoireVirtualList).props('items')
      const scrollerItems = wrapper.getComponent(RecycleScroller).props('items')
      await unrelatedPublish(session)
      expect(wrapper.getComponent(HistoireVirtualList).props('items')).toBe(items)
      expect(wrapper.getComponent(RecycleScroller).props('items')).toBe(scrollerItems)
      // Real selection changes still project fresh rows.
      await session.selection.select({ storyId: 'a', variantId: 'b:c' })
      await nextTick()
      expect(wrapper.getComponent(HistoireVirtualList).props('items')).not.toBe(items)
    }
    finally {
      wrapper.unmount()
      folders.close()
      await session.dispose()
    }
  })

  it('keeps project test rows when unrelated snapshot fields change', async () => {
    const { fixture, session } = await connected()
    const model = createWorkbenchTestsModel(session)
    try {
      const rows = model.rows.value
      const visible = model.visibleRows.value
      await unrelatedPublish(session)
      expect(model.rows.value).toBe(rows)
      expect(model.visibleRows.value).toBe(visible)
      // Catalog replacement still projects its new rows.
      fixture.descriptor.catalog.diagnostics.push({ code: 'COLLECT_ERROR', message: 'Could not collect', severity: 'error', storyId: 'broken' })
      fixture.emitCatalog()
      await vi.waitFor(() => expect(model.rows.value).not.toBe(rows))
    }
    finally {
      model.close()
      await session.dispose()
    }
  })

  it('keeps displayed events when unrelated snapshot fields change', async () => {
    const { fixture, session } = await connected()
    await session.mount(document.createElement('div'), { surface: 'preview' }).ready
    const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(HistoireEvents, { inlineDetails: true }) }, attachTo: document.body })
    try {
      fixture.emitEvent(1)
      await nextTick()
      const items = wrapper.getComponent(HistoireVirtualList).props('items')
      expect(items).toHaveLength(1)
      await unrelatedPublish(session)
      expect(wrapper.getComponent(HistoireVirtualList).props('items')).toBe(items)
      fixture.emitEvent(2)
      await nextTick()
      expect(wrapper.getComponent(HistoireVirtualList).props('items')).toHaveLength(2)
    }
    finally {
      wrapper.unmount()
      await session.dispose()
    }
  })
})
