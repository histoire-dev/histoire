import { afterEach, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createMarketplaceClient } from '../../../../histoire-app/src/app/util/marketplace-client.js'
import { flushMicrotasks } from '../../../../histoire/src/node/__tests__/utils/flush.js'
import { flushCatalog } from '../utils/marketplace-transport.js'
import { setup } from './fixture.js'

const cleanups: (() => unknown)[] = []
afterEach(async () => {
  for (const dispose of cleanups.splice(0).reverse()) await dispose()
  vi.unstubAllGlobals()
})

// Real provider/modal/select; only channel and missing jsdom APIs substituted.
// An outer teleport is unusable behind a native top layer even if options exist.
it('opens usable sort choices inside the marketplace dialog', async () => {
  const { wrapper, store, channel, dialog } = setup(cleanups, true)
  store.openMarketplace('all')
  await flushCatalog()
  const offline = createMarketplaceClient({ transport: { ...channel.transport, available: () => false } })
  const page = await offline.catalog({ view: 'all', prefs: store.prefs.value })
  const request = channel.sent.filter(item => item.event === 'histoire:ui:marketplace-catalog').at(-1)!
  channel.emit('histoire:ui:marketplace-catalog-result', { requestId: request.value.requestId, page })
  await flushMicrotasks(5)
  await vi.waitFor(() => expect(wrapper.find('button[aria-label="Sort plugins"]').exists()).toBe(true))
  await wrapper.get('button[aria-label="Sort plugins"]').trigger('click')
  await vi.waitFor(() => expect(document.querySelector('[role="listbox"]')).not.toBeNull())
  const list = document.querySelector('[role="listbox"]')!
  expect(list.closest('dialog')).toBe(dialog)
  const choices = [...list.querySelectorAll<HTMLButtonElement>('[role="option"]')]
  expect(choices.map(choice => choice.textContent!.trim())).toEqual(['Relevance', 'Name', 'Recently updated'])
  choices[1].click()
  await nextTick()
  expect(store.sort.value).toBe('name')
  expect(wrapper.get('button[aria-label="Sort plugins"]').text()).toBe('Name')
})
