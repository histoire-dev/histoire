import type { HistoireVirtualListHandle } from '../foundation/VirtualList.js'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { useWorkbenchListSizes } from '../../../histoire-app/src/app/composables/list-density.js'
import { createUiSettingsStore, provideUiSettingsStore } from '../../../histoire-app/src/app/stores/settings.js'
import { HistoireVirtualList } from '../foundation/VirtualList.js'
import { virtualViewport } from './fixtures/virtual-viewport.js'

afterEach(() => vi.restoreAllMocks())

describe('shared virtual tab lists', () => {
  it('bounds a thousand rows and reveals distant keyboard targets with exact activation after recycling', async () => {
    virtualViewport()
    const items = Array.from({ length: 1000 }, (_, index) => ({ key: `row-${index}`, label: `Variant ${index}` }))
    const activate = vi.fn()
    const wrapper = mount(HistoireVirtualList, {
      props: { items, itemSize: 32 },
      slots: { default: ({ index }: { index: number }) => h('button', { type: 'button', onClick: () => activate(items[index].key) }, items[index].label) },
      attachTo: document.body,
    })
    try {
      await flushPromises()
      expect(wrapper.findAll('button').length).toBeLessThan(30)
      expect(wrapper.findAll('button').length).toBeGreaterThan(0)
      const list = wrapper.vm as unknown as HistoireVirtualListHandle
      await list.focus('row-999')
      expect(document.activeElement?.textContent).toBe('Variant 999')
      ;(document.activeElement as HTMLButtonElement).click()
      expect(activate).toHaveBeenLastCalledWith('row-999')
      expect(wrapper.findAll('button').length).toBeLessThan(30)
      await list.focus('row-0')
      expect(document.activeElement?.textContent).toBe('Variant 0')
      await wrapper.setProps({ items: items.slice(0, 10) })
      const beforeRemovedFocus = document.activeElement
      await list.focus('row-999')
      expect(document.activeElement).toBe(beforeRemovedFocus)
      expect(activate).toHaveBeenCalledTimes(1)
      await nextTick()
    }
    finally { wrapper.unmount() }
  })

  it('keeps distant focus and row identity after scoped density changes', async () => {
    virtualViewport()
    const settings = createUiSettingsStore({})
    const items = Array.from({ length: 1000 }, (_, index) => ({ key: `row-${index}`, label: `Variant ${index}` }))
    const selected = vi.fn()
    const list = ref<HistoireVirtualListHandle>()
    const Rows = defineComponent({
      setup() {
        const sizes = useWorkbenchListSizes(() => 32, () => undefined)
        return () => h(HistoireVirtualList, { ref: list, items, itemSize: sizes.itemSize.value }, { default: ({ index }: { index: number }) => h('button', { onClick: () => selected(items[index].key) }, items[index].label) })
      },
    })
    const Owner = defineComponent({
      setup() {
        provideUiSettingsStore(settings)
        return () => h(Rows)
      },
    })
    const wrapper = mount(Owner, { attachTo: document.body })
    try {
      await flushPromises()
      expect(wrapper.findComponent(HistoireVirtualList).props('itemSize')).toBe(32)
      await list.value?.focus('row-999')
      settings.update({ density: 'compact' })
      await nextTick()
      expect(wrapper.findComponent(HistoireVirtualList).props('itemSize')).toBe(28)
      await list.value?.focus('row-999')
      expect(document.activeElement?.textContent).toBe('Variant 999')
      ;(document.activeElement as HTMLButtonElement).click()
      expect(selected).toHaveBeenLastCalledWith('row-999')
      expect(wrapper.findAll('button').length).toBeLessThan(35)
      settings.reset()
      await nextTick()
      expect(wrapper.findComponent(HistoireVirtualList).props('itemSize')).toBe(32)
      await list.value?.focus('row-0')
      expect(document.activeElement?.textContent).toBe('Variant 0')
    }
    finally { wrapper.unmount() }
  })

  it('retires superseded, removed and unmounted reveal requests before touching focus', async () => {
    virtualViewport(true)
    const items = Array.from({ length: 1000 }, (_, index) => ({ key: `row-${index}` }))
    const wrapper = mount(HistoireVirtualList, {
      props: { items, itemSize: 32 },
      slots: { default: ({ index }: { index: number }) => h('button', `Variant ${index}`) },
      attachTo: document.body,
    })
    const list = wrapper.vm as unknown as HistoireVirtualListHandle
    const host = document.createElement('button')
    document.body.append(host)
    try {
      await Promise.all([list.focus('row-999'), list.focus('row-0')])
      expect(document.activeElement?.textContent).toBe('Variant 0')
      host.focus()
      const removed = list.focus('row-999')
      await wrapper.setProps({ items: items.slice(0, 10) })
      await removed
      expect(document.activeElement).toBe(host)
      const retired = list.focus('row-9')
      wrapper.unmount()
      await retired
      expect(document.activeElement).toBe(host)
    }
    finally {
      if (wrapper.exists()) wrapper.unmount()
      host.remove()
    }
  })
})
