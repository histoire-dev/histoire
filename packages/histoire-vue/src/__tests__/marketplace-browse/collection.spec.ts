import { afterEach, expect, it, vi } from 'vitest'
import { flushCatalog } from '../utils/marketplace-transport.js'
import { browseFixture, catalogPage } from './fixture.js'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
  vi.useRealTimers()
})

it.each(['See all', 'Try'])('loads all 14 collection members through server pages from %s', async (action) => {
  vi.useFakeTimers()
  const fixture = await browseFixture('discover')
  cleanups.push(fixture.dispose)
  const { wrapper, store, request, reply } = fixture
  const page = await catalogPage()
  const members = Array.from({ length: 14 }, (_, index) => ({ ...page.entries[0], id: `member-${index}`, displayName: `Member ${index}` }))
  const group = { id: 'visual-testing', title: 'Visual testing', entries: members.slice(0, 12) }
  await reply({ ...page, discover: { picks: [], collections: [group] } })
  if (action === 'Try') {
    store.setQuery('absent')
    await reply({ ...page, entries: [], total: 0 })
  }
  await wrapper.get(`button[aria-label="${action} Visual testing"]`).trigger('click')
  await flushCatalog()
  expect(store.view.value).toBe('all')
  expect(request().value.query).toMatchObject({ query: '', filters: { collection: 'visual-testing' } })
  await reply({ ...page, entries: members.slice(0, 12), total: 14, cursor: '12' })
  expect(wrapper.text()).toContain('14 plugins')
  expect(wrapper.findAll('article')).toHaveLength(12)
  await wrapper.get('button[aria-label="Load more plugins"]').trigger('click')
  await flushCatalog()
  expect(request().value.query).toMatchObject({ cursor: '12', filters: { collection: 'visual-testing' } })
  await reply({ ...page, entries: members.slice(12), total: 14 })
  expect(wrapper.findAll('article').map(card => card.get('h3').text())).toEqual(members.map(entry => entry.displayName))
  expect(wrapper.find('button[aria-label="Load more plugins"]').exists()).toBe(false)
  await fixture.selectSort('Name')
  await flushCatalog()
  expect(request().value.query).toMatchObject({ sort: 'name', filters: { collection: 'visual-testing' } })
})
