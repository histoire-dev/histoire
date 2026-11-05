import { expect, it } from 'vitest'
import { plugin, setup } from './fixtures.js'

// Boundary: real detail/store/client rendering, external channel replies only.
// Missing docs, invented dates or lost contribution kinds must change visible content.
it('links publisher documentation and names each contribution kind', async () => {
  const { wrapper, reply } = setup()
  await reply({ ...plugin(), docsUrl: 'https://docs.example.com/a11y' })
  const docs = wrapper.get('a[aria-label="Documentation"]')
  expect(docs.attributes('href')).toBe('https://docs.example.com/a11y')
  expect(docs.attributes('target')).toBe('_blank')
  expect(docs.attributes('rel')).toContain('noopener')
  expect(wrapper.get('section[aria-label="Adds to your workbench"]').findAll('li').map(row => ({ kind: row.get('h3').text(), description: row.get('span').text() }))).toEqual([
    { kind: 'Project pane', description: 'Audit results' },
    { kind: 'Story tests', description: 'Variant checks' },
  ])
})

it('omits unknown update date and docs and keeps unrestricted frameworks explicit', async () => {
  const { wrapper, reply } = setup()
  await reply({ ...plugin(), updatedAt: undefined, docsUrl: undefined, frameworks: [], adds: [] })
  const metadata = wrapper.get('aside[aria-label="Plugin metadata"]')
  expect(metadata.findAll('dt').map(term => term.text())).toEqual(['Version', 'License', 'Requires', 'Frameworks'])
  expect(metadata.text()).toContain('Any')
  expect(wrapper.find('a[aria-label="Documentation"]').exists()).toBe(false)
  expect(wrapper.get('section[aria-label="Adds to your workbench"] [role="status"]').text()).toContain('No declared contributions')
})

// Navigation retains query/facets; only selected package and nested flow are cleared.
it('returns from detail to All plugins without losing current filters', async () => {
  const { store, reply, button } = setup()
  store.setQuery('audit')
  store.setFilters({ frameworks: ['vue'], officialOnly: true })
  await reply()
  await button('All plugins').trigger('click')
  expect(store.view.value).toBe('all')
  expect(store.query.value).toBe('audit')
  expect(store.filters.value).toEqual({ frameworks: ['vue'], officialOnly: true })
  expect(store.selectedId.value).toBeUndefined()
})
