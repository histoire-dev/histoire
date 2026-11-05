import { afterEach, expect, it, vi } from 'vitest'
import { flushMicrotasks } from '../../../histoire/src/node/__tests__/utils/flush.js'
import { browseFixture, catalogPage } from './marketplace-browse/fixture.js'
import { flushCatalog } from './utils/marketplace-transport.js'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const dispose of cleanups.splice(0).reverse()) dispose()
})

// Boundary: real SFC/store/client through substituted external channel. Independent
// requests and visible outcomes reject swapped facets, missing actions and stale data.
it('renders server facet counts, highlights inclusive matches and routes card actions', async () => {
  const fixture = await browseFixture()
  cleanups.push(fixture.dispose)
  const { wrapper, store, reply, request } = fixture
  const page = await catalogPage()
  page.entries = page.entries.slice(0, 2)
  page.entries[0].displayName = 'Accessibility'
  page.entries[0].summary = 'Audit components'
  page.entries[0].match = [{ field: 'displayName', ranges: [[0, 5]] }, { field: 'summary', ranges: [[0, 4]] }]
  page.entries[1].installed = { version: '1.0.0', enabled: true, required: false }
  page.facets.category.testing = 23
  page.total = 27
  await reply(page)
  expect(wrapper.get('aside[aria-label="Plugin facets"]').text()).toContain('Testing23')
  expect(wrapper.text()).toContain('27 plugins')
  expect(wrapper.text()).toContain('Works with Vue 3')
  expect(wrapper.findAll('mark').map(mark => mark.text())).toEqual(['Access', 'Audit'])
  expect(wrapper.findAll('article')[1].text()).toContain('Installed')
  await wrapper.get('[role="checkbox"][aria-label="Category: Testing"]').trigger('click')
  await flushCatalog()
  expect(request().value.query.filters.category).toBe('testing')
  const card = wrapper.findAll('article')[0]
  await card.get('button[aria-label="Install Accessibility"]').trigger('click')
  expect(store.installRequest.value).toMatchObject({ kind: 'install', id: page.entries[0].id, prefs: { community: false } })
  expect(store.history.value).toHaveLength(1)
  store.back()
  await flushCatalog()
  await wrapper.get('button[aria-label="Details for Accessibility"]').trigger('click')
  await flushCatalog()
  expect(store.view.value).toBe('detail')
  expect(store.selectedId.value).toBe(page.entries[0].id)
  expect(store.history.value).toHaveLength(1)
})

it('sends framework, publisher and adds facets, sort and reset without losing search', async () => {
  const fixture = await browseFixture()
  cleanups.push(fixture.dispose)
  const { wrapper, store, reply, request } = fixture
  await reply(await catalogPage())
  store.setQuery('audit')
  await flushCatalog()
  await wrapper.get('[role="checkbox"][aria-label="Framework: Vue 3"]').trigger('click')
  await flushCatalog()
  await wrapper.get('[role="checkbox"][aria-label="Official only"]').trigger('click')
  await flushCatalog()
  await wrapper.get('[role="checkbox"][aria-label="Adds: Story tests"]').trigger('click')
  await flushCatalog()
  expect(request().value.query).toMatchObject({ query: 'audit', filters: { frameworks: ['vue'], officialOnly: true, adds: ['story-tests'] } })
  expect(wrapper.text()).toContain('detected')
  expect(await fixture.selectSort('Recently updated')).toEqual(['Relevance', 'Name', 'Recently updated'])
  await flushCatalog()
  expect(request().value.query.sort).toBe('updated')
  await wrapper.get('button[aria-label="Reset facets"]').trigger('click')
  await flushCatalog()
  expect(request().value.query.filters).toEqual({})
  expect(store.query.value).toBe('audit')
})

it('recovers empty searches with consent, clear filters and collection suggestions', async () => {
  const fixture = await browseFixture()
  cleanups.push(fixture.dispose)
  const { store, wrapper, reply, request } = fixture
  const page = await catalogPage()
  page.entries = []
  page.total = 0
  page.discover = { picks: [], collections: [{ id: 'visual-testing', title: 'Visual testing', entries: [] }] }
  store.setQuery('missing')
  store.setFilters({ category: 'testing' })
  await flushCatalog()
  await reply(page)
  expect(wrapper.get('[role="status"]').text()).toContain('No matches')
  expect(wrapper.get('q').text()).toBe('missing')
  expect(wrapper.text()).toContain('Testing')
  expect(wrapper.get('a').text()).toBe('Plugin guide')
  await wrapper.get('button[aria-label="Include community plugins"]').trigger('click')
  await flushCatalog()
  expect(request().value.query.prefs.community).toBe(true)
  expect(wrapper.find('button[aria-label="Include community plugins"]').exists()).toBe(false)
  await wrapper.get('button[aria-label="Clear filters"]').trigger('click')
  await flushCatalog()
  expect(store.query.value).toBe('')
  expect(store.filters.value).toEqual({})
  await reply({ ...page, sources: { official: 'ok', community: 'ok' } })
  await wrapper.get('button[aria-label="Try Visual testing"]').trigger('click')
  await flushCatalog()
  expect(store.view.value).toBe('all')
})

it('shows loading and retry, retaining official results after failed refresh', async () => {
  const fixture = await browseFixture()
  cleanups.push(fixture.dispose)
  const { wrapper, channel, request, reply, store } = fixture
  await vi.waitFor(() => expect(wrapper.text()).toContain('Loading plugins'))
  channel.emit('histoire:ui:marketplace-catalog-result', { requestId: request().value.requestId, error: { code: 'failed', message: 'Registry failed' } })
  await flushMicrotasks(5)
  expect(wrapper.get('[role="alert"]').text()).toContain('Couldn\'t load plugins')
  await wrapper.get('button[aria-label="Retry loading plugins"]').trigger('click')
  await flushCatalog()
  const page = await catalogPage()
  page.sources.community = 'stale'
  await reply(page)
  expect(wrapper.text()).toContain('Community plugins unavailable')
  expect(wrapper.findAll('article')).toHaveLength(10)
  store.setQuery('next')
  await flushCatalog()
  expect(wrapper.text()).not.toContain('Loading plugins')
  channel.emit('histoire:ui:marketplace-catalog-result', { requestId: request().value.requestId, error: { code: 'failed', message: 'Refresh failed' } })
  await flushMicrotasks(5)
  expect(wrapper.get('[role="alert"]').text()).toContain('Refresh failed')
  expect(wrapper.findAll('article')).toHaveLength(10)
})

it('renders project recommendations and opens collections in All plugins', async () => {
  const fixture = await browseFixture('discover')
  cleanups.push(fixture.dispose)
  const { wrapper, reply, store, request } = fixture
  const page = await catalogPage()
  page.discover = {
    hero: { ...page.entries[0], reason: 'Vitest detected' },
    picks: [{ ...page.entries[1], reason: 'No design tools installed' }],
    collections: [{ id: 'visual-testing', title: 'Visual testing', entries: page.entries.slice(0, 2) }],
  }
  await reply(page)
  expect(wrapper.get('section[aria-label="For this project"]').text()).toContain('Vitest')
  expect(wrapper.text()).toContain('Vitest detected')
  expect(wrapper.text()).toContain('No design tools installed')
  await wrapper.get('button[aria-label="See all Visual testing"]').trigger('click')
  await flushCatalog()
  expect(store.view.value).toBe('all')
  // The Discover page never stands in for All plugins while its own page loads.
  expect(wrapper.text()).toContain('Loading plugins')
  expect(request().value.query.filters).toEqual({ collection: 'visual-testing' })
  await reply({ ...page, entries: page.entries.slice(0, 2), total: 2, discover: undefined })
  expect(wrapper.text()).toContain('Visual testing')
  expect(wrapper.findAll('article').map(card => card.get('h3').text())).toEqual(page.entries.slice(0, 2).map(entry => entry.displayName))
})

it('keeps static official plugins discoverable and announces an empty recommendation payload', async () => {
  const fixture = await browseFixture('discover')
  cleanups.push(fixture.dispose)
  const page = await catalogPage()
  await fixture.reply(page)
  expect(fixture.wrapper.get('section[aria-label="Official plugins"]').findAll('article')).toHaveLength(10)
  const refresh = fixture.store.loadCatalog()
  await fixture.reply({ ...page, discover: { picks: [], collections: [] } })
  await refresh
  expect(fixture.wrapper.get('[role="status"]').text()).toContain('No recommendations')
})
