import { afterEach, expect, it, vi } from 'vitest'
import { flushMicrotasks } from '../../../../histoire/src/node/__tests__/utils/flush.js'
import { flushCatalog } from '../utils/marketplace-transport.js'
import { browseFixture, catalogPage } from './fixture.js'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const dispose of cleanups.splice(0).reverse()) dispose()
})

it('appends exact cursor results, keeps earlier cards, and drops late pages after new search', async () => {
  const fixture = await browseFixture()
  cleanups.push(fixture.dispose)
  const { wrapper, reply, store, request, channel } = fixture
  const page = await catalogPage()
  const [first, second, third] = page.entries
  await reply({ ...page, entries: [first], total: 3, cursor: '1' })
  await wrapper.get('button[aria-label="Load more plugins"]').trigger('click')
  await flushCatalog()
  await vi.waitFor(() => expect(request().value.query.cursor).toBe('1'))
  await reply({ ...page, entries: [second], total: 3, cursor: '2' })
  expect(wrapper.findAll('article').map(card => card.get('h3').text())).toEqual([first.displayName, second.displayName])
  await wrapper.get('button[aria-label="Load more plugins"]').trigger('click')
  await flushCatalog()
  await vi.waitFor(() => expect(request().value.query.cursor).toBe('2'))
  const retired = request()
  store.setQuery('design')
  await flushCatalog()
  const fresh = request()
  channel.emit('histoire:ui:marketplace-catalog-result', { requestId: retired.value.requestId, page: { ...page, entries: [third], total: 3 } })
  channel.emit('histoire:ui:marketplace-catalog-result', { requestId: fresh.value.requestId, page: { ...page, entries: [second], total: 1 } })
  await flushMicrotasks(5)
  expect(wrapper.findAll('article').map(card => card.get('h3').text())).toEqual([second.displayName])
  expect(wrapper.find('button[aria-label="Load more plugins"]').exists()).toBe(false)
})

it('retains collection suggestions after leaving Discover for an empty search', async () => {
  const fixture = await browseFixture('discover')
  cleanups.push(fixture.dispose)
  const { wrapper, reply, store } = fixture
  const page = await catalogPage()
  await reply({ ...page, discover: { picks: [], collections: [{ id: 'design-handoff', title: 'Design handoff', entries: [page.entries[0]] }] } })
  store.setQuery('absent')
  await flushCatalog()
  await reply({ ...page, entries: [], total: 0 })
  await wrapper.get('button[aria-label="Try Design handoff"]').trigger('click')
  expect(store.query.value).toBe('')
  expect(store.filters.value).toEqual({ collection: 'design-handoff' })
  await reply({ ...page, entries: [page.entries[1]], total: 1 })
  expect(wrapper.findAll('article').map(card => card.get('h3').text())).toEqual([page.entries[1].displayName])
})

it('retries failed cursor pages without losing earlier cards and releases reads on unmount', async () => {
  const fixture = await browseFixture()
  cleanups.push(fixture.dispose)
  const { wrapper, reply, request, channel } = fixture
  const page = await catalogPage()
  await reply({ ...page, entries: [page.entries[0]], total: 2, cursor: '1' })
  await wrapper.get('button[aria-label="Load more plugins"]').trigger('click')
  await flushCatalog()
  channel.emit('histoire:ui:marketplace-catalog-result', { requestId: request().value.requestId, error: { code: 'failed', message: 'Page unavailable' } })
  await flushMicrotasks(5)
  expect(wrapper.get('[role="alert"]').text()).toContain('Page unavailable')
  expect(wrapper.findAll('article')).toHaveLength(1)
  await wrapper.get('[role="alert"] button').trigger('click')
  await flushCatalog()
  expect(request().value.query.cursor).toBe('1')
  expect(channel.listenerCount()).toBe(1)
  wrapper.unmount()
  expect(channel.listenerCount()).toBe(0)
})
