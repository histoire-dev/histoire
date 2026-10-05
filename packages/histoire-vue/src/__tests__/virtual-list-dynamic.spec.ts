import type { HistoireVirtualListHandle } from '../foundation/VirtualList.js'
import { mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import { h, nextTick } from 'vue'
import { DynamicScroller } from 'vue-virtual-scroller'
import { HistoireVirtualList } from '../foundation/VirtualList.js'
import { virtualViewport } from './fixtures/virtual-viewport.js'

afterEach(() => vi.restoreAllMocks())

it('reveals measured dynamic rows after delayed native scroll without clearing cached sizes', async () => {
  const viewport = virtualViewport(true)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(61)
  const items = Array.from({ length: 1000 }, (_, index) => ({ key: `row-${index}` }))
  const selected = vi.fn()
  const wrapper = mount(HistoireVirtualList, {
    props: { items, minItemSize: 40 },
    slots: { default: ({ index }: { index: number }) => h('button', { onClick: () => selected(items[index].key) }, `Variant ${index}`) },
    attachTo: document.body,
  })
  const host = document.createElement('input')
  document.body.append(host)
  try {
    // Script-setup render functions expose public methods through the component ref.
    const dynamic = wrapper.findComponent(DynamicScroller).vm.$.exposed!
    await vi.waitFor(() => expect(dynamic.getItemSize(items[0], 0)).toBe(61))
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    host.focus()
    const list = wrapper.vm as unknown as HistoireVirtualListHandle
    const reveal = list.reveal('row-999').then(row => ({ row, error: undefined }), error => ({ row: undefined, error }))
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    viewport.deliverScroll()
    const result = await reveal
    expect(result.error).toBeUndefined()
    expect(result.row?.dataset.virtualKey).toBe('row-999')
    expect(document.activeElement).toBe(host)
    expect(dynamic.getItemSize(items[0], 0)).toBe(61)
    expect(wrapper.findAll('button').length).toBeLessThan(35)
    await list.focus('row-999')
    expect(document.activeElement?.textContent).toBe('Variant 999')
    ;(document.activeElement as HTMLButtonElement).click()
    expect(selected).toHaveBeenLastCalledWith('row-999')
    const home = list.focus('row-0')
    await nextTick()
    viewport.deliverScroll()
    await home
    expect(document.activeElement?.textContent).toBe('Variant 0')
    expect(dynamic.getItemSize(items[0], 0)).toBe(61)
    host.focus()
    const removed = list.focus('row-999')
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    await wrapper.setProps({ items: items.slice(0, 10) })
    await removed
    viewport.deliverScroll()
    expect(document.activeElement).toBe(host)
    await wrapper.setProps({ items })
    const restoredHome = list.focus('row-0')
    await nextTick()
    viewport.deliverScroll()
    await restoredHome
    host.focus()
    const retired = list.focus('row-999')
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    wrapper.unmount()
    host.focus()
    await retired
    expect(document.activeElement).toBe(host)
  }
  finally {
    if (wrapper.exists()) wrapper.unmount()
    host.remove()
  }
})
