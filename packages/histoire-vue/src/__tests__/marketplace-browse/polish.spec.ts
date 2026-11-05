import { afterEach, expect, it } from 'vitest'
import { flushCatalog } from '../utils/marketplace-transport.js'
import { browseFixture, catalogPage } from './fixture.js'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const dispose of cleanups.splice(0).reverse()) dispose()
})

// Real browse/store/client, substituted channel only. Distinct framework choices
// catch switches that erase manual filters; requests expose exact retained state.
it('toggles detected frameworks without discarding other facets or search', async () => {
  const fixture = await browseFixture()
  cleanups.push(fixture.dispose)
  const { wrapper, store, reply, request } = fixture
  const page = await catalogPage()
  page.project.frameworks = ['vue', 'svelte']
  await reply(page)
  store.setQuery('audit')
  store.setFilters({ frameworks: ['react'], adds: ['story-tests'] })
  await flushCatalog()
  const control = wrapper.get('input[role="switch"][aria-label="Works with Vue 3, Svelte"]')
  await control.setValue(true)
  await flushCatalog()
  expect(request().value.query).toMatchObject({ query: 'audit', filters: { frameworks: ['react', 'vue', 'svelte'], adds: ['story-tests'] } })
  await control.setValue(false)
  await flushCatalog()
  expect(request().value.query.filters).toEqual({ frameworks: ['react'], adds: ['story-tests'] })
})

it('removes individual filter chips while preserving every other active constraint', async () => {
  const fixture = await browseFixture()
  cleanups.push(fixture.dispose)
  const { wrapper, store, reply, request } = fixture
  await reply(await catalogPage())
  store.setQuery('audit')
  store.setFilters({ category: 'testing', frameworks: ['vue', 'react'], officialOnly: true, adds: ['story-tests', 'cli-command'] })
  await flushCatalog()
  await wrapper.get('button[aria-label="Remove Vue 3 filter"]').trigger('click')
  await flushCatalog()
  expect(request().value.query.filters).toEqual({ category: 'testing', frameworks: ['react'], officialOnly: true, adds: ['story-tests', 'cli-command'] })
  await wrapper.get('button[aria-label="Remove Story tests filter"]').trigger('click')
  await wrapper.get('button[aria-label="Remove Testing filter"]').trigger('click')
  await wrapper.get('button[aria-label="Remove Official only filter"]').trigger('click')
  await flushCatalog()
  expect(request().value.query).toMatchObject({ query: 'audit', filters: { frameworks: ['react'], adds: ['cli-command'] } })
  await wrapper.get('button[aria-label="Remove React filter"]').trigger('click')
  await wrapper.get('button[aria-label="Remove CLI command filter"]').trigger('click')
  await flushCatalog()
  expect(request().value.query).toMatchObject({ query: 'audit', filters: {} })
  expect(request().value.query.filters).toEqual({})
  await wrapper.get('[role="checkbox"][aria-label="Category: Design"]').trigger('click')
  await flushCatalog()
  expect(request().value.query.filters.category).toBe('design')
})

// Four distinct entries distinguish complete compact collections from old three-card
// truncation. Whole-tile action must open fourth identity, never start installation.
it('labels project signals and exposes four collection links with publisher state', async () => {
  const fixture = await browseFixture('discover')
  cleanups.push(fixture.dispose)
  const { wrapper, store, reply } = fixture
  const page = await catalogPage()
  page.project.signals = ['vite 8', 'vitest']
  const entries = page.entries.slice(0, 4)
  entries[0].installed = { version: '1.0.0', enabled: true, required: false }
  entries[3] = { ...entries[3], official: false, publisher: 'community-author' }
  page.discover = { picks: [], collections: [{ id: 'tools', title: 'Tools', entries }] }
  await reply(page)
  const project = wrapper.get('section[aria-label="For this project"]')
  expect(project.text()).toContain('Vue 3')
  expect(project.text()).toContain('Vite 8')
  expect(project.text()).toContain('Vitest')
  const collection = wrapper.get('section[aria-label="Tools"]')
  expect(collection.text()).toContain('Official · installed')
  expect(collection.text()).toContain('community-author')
  expect(collection.findAll('button[aria-label^="Details for "]')).toHaveLength(4)
  await collection.get(`button[aria-label="Details for ${entries[3].displayName}"]`).trigger('click')
  expect(store.selectedId.value).toBe(entries[3].id)
  expect(store.view.value).toBe('detail')
  expect(store.installRequest.value).toBeUndefined()
})
