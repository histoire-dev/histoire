import { expect, it } from 'vitest'
import { nextTick } from 'vue'
import { flushMicrotasks } from '../../../histoire/src/node/__tests__/utils/flush.js'
import { plugin, setup } from './marketplace-detail/fixtures.js'

// Boundary: user reads server metadata and starts wizard. Wrong version/kind or hidden
// compatibility failure must change public intent. No package code or job is executed.
it('renders identity, contributions, breadcrumb and metadata without inventing provenance', async () => {
  const { wrapper, reply } = setup()
  await reply()
  expect(wrapper.get('nav[aria-label="Plugin breadcrumb"]').text().replace(/\s+/g, ' ')).toBe('All plugins / Testing')
  expect(wrapper.get('h1').text()).toBe('Accessibility')
  for (const text of ['Official', '@histoire/plugin-a11y', '@histoire', 'Adds to your workbench', 'Audit results', 'Variant checks']) expect(wrapper.text()).toContain(text)
  // Official identities carry a bundled logo instead of their monogram.
  expect(wrapper.text()).not.toContain('Ax')
  expect(wrapper.find('[style*="--plugin-logo"]').exists()).toBe(true)
  const metadata = wrapper.get('aside[aria-label="Plugin metadata"]')
  for (const text of ['Version', '2.0.0', 'Updated', '2026-11-04', 'License', 'MIT', 'Requires', '>=1.0.0', '^3.5.0', 'Frameworks', 'Vue 3', 'React', 'Access', 'Declared by publisher', 'Story DOM', 'Network', 'Repository']) expect(metadata.text()).toContain(text)
  expect(metadata.get('a').attributes('href')).toBe('https://github.com/histoire-dev/a11y')
  expect(wrapper.text()).not.toContain('Published with npm provenance')
})

it.each([['latest', '2.0.0'], ['menu', '1.5.0']])('starts install with %s version and current preferences', async (action, version) => {
  const { wrapper, store, reply, button } = setup(action === 'menu')
  store.prefs.value.packageManager = 'pnpm'
  await reply()
  if (action === 'menu') {
    await wrapper.get('button[aria-label="Choose version"]').trigger('click')
    await nextTick()
    const rows = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
    expect(rows.map(row => row.textContent?.trim())).toEqual(['2.0.0', '1.5.0', '1.0.0'])
    expect(rows[0].closest('[role="menu"]')?.parentElement).toBe(wrapper.get('dialog').element)
    rows[1].focus()
    expect(document.activeElement).toBe(rows[1])
    expect(rows[2].disabled).toBe(true)
    expect(rows[2].title).toBe('Needs vite ^8.0.0')
    rows[1].click()
  }
  else {
    await button('Install').trigger('click')
  }
  expect(store.view.value).toBe('install')
  expect(store.installRequest.value).toEqual({ id: '@histoire/plugin-a11y', kind: 'install', version, prefs: store.prefs.value })
})

// The listing and the installable release can have distinct Histoire requirements.
it('starts installation of the suggested older release when the listing needs a newer Histoire', async () => {
  const { store, reply, button } = setup()
  await reply({
    ...plugin(),
    installVersion: '1.4.0',
    compatible: { ok: false, reason: 'Needs histoire ^2.0.0' },
    versions: [{ version: '2.0.0', compatible: false, reason: 'Needs histoire ^2.0.0' }, { version: '1.4.0', compatible: true }],
  })
  await button('Install').trigger('click')
  expect(store.installRequest.value).toMatchObject({ id: '@histoire/plugin-a11y', kind: 'install', version: '1.4.0' })
})

it('opens version menu by keyboard, skips incompatible rows and restores trigger on Escape', async () => {
  const { wrapper, reply } = setup(true)
  await reply()
  const trigger = wrapper.get('button[aria-label="Choose version"]')
  await trigger.trigger('keydown', { key: 'ArrowDown' })
  await nextTick()
  const rows = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
  expect(rows).toHaveLength(3)
  expect(rows[0].closest('dialog')).toBe(wrapper.get('dialog').element)
  expect(document.activeElement).toBe(rows[0])
  rows[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
  expect(document.activeElement).toBe(rows[1])
  rows[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
  expect(document.activeElement).toBe(rows[0])
  rows[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await nextTick()
  expect(document.querySelector('[role="menu"]')).toBeNull()
  expect(document.activeElement).toBe(trigger.element)
})
it('returns to category with existing search and framework filter intact', async () => {
  const { store, reply, button } = setup()
  store.setQuery('audit')
  store.setFilters({ frameworks: ['vue'] })
  await reply()
  await button('Testing').trigger('click')
  expect(store.view.value).toBe('all')
  expect(store.query.value).toBe('audit')
  expect(store.filters.value).toEqual({ frameworks: ['vue'], category: 'testing' })
})

// Boundary: real tab focus and panels. Merely changing text without roving tab focus
// must fail; defaults and notes are independent expected values, not snapshots.
it('navigates tabs by keyboard and renders option reference, notes and versions', async () => {
  const { wrapper, reply } = setup()
  await reply()
  const tabs = wrapper.findAll('[role="tab"]')
  expect(tabs.map(tab => tab.text())).toEqual(['Overview', 'Options', 'Changelog', 'Versions'])
  for (const tab of tabs) expect(wrapper.find(`#${tab.attributes('aria-controls')}`).exists()).toBe(true)
  await tabs[0].trigger('keydown', { key: 'ArrowRight' })
  expect(document.activeElement).toBe(tabs[1].element)
  expect(tabs[1].attributes('aria-selected')).toBe('true')
  expect(tabs[0].attributes('tabindex')).toBe('-1')
  const panel = wrapper.get('[role="tabpanel"]:not([hidden])')
  expect(panel.attributes('aria-labelledby')).toBe(tabs[1].attributes('id'))
  expect(panel.attributes('id')).toBe(tabs[1].attributes('aria-controls'))
  const rows = wrapper.findAll('tbody tr').map(row => row.text())
  expect(rows[0]).toContain('false')
  expect(rows[0]).toContain('One check per variant')
  expect(rows[1]).toContain('aa')
  expect(rows[2]).toContain('[]')
  await tabs[1].trigger('keydown', { key: 'ArrowRight' })
  for (const text of ['Breaking', 'New', 'Fix', 'Rename audit rule', 'Add keyboard checks', 'Fix audit cleanup']) expect(wrapper.get('[role="tabpanel"]:not([hidden])').text()).toContain(text)
  expect(wrapper.get('a[aria-label="Repository releases"]').attributes('href')).toBe('https://github.com/histoire-dev/a11y/releases')
  await tabs[2].trigger('keydown', { key: 'End' })
  expect(document.activeElement).toBe(tabs[3].element)
  expect(wrapper.get('[role="tabpanel"]:not([hidden])').text()).toContain('Deprecated')
  expect(wrapper.get('[role="tabpanel"]:not([hidden])').text()).toContain('Needs vite ^8.0.0')
  await tabs[3].trigger('keydown', { key: 'ArrowRight' })
  expect(document.activeElement).toBe(tabs[0].element)
  await tabs[0].trigger('keydown', { key: 'ArrowLeft' })
  expect(document.activeElement).toBe(tabs[3].element)
  await tabs[3].trigger('keydown', { key: 'Home' })
  expect(document.activeElement).toBe(tabs[0].element)
})
it('disables incompatible installation and exposes exact project reason', async () => {
  const { wrapper, store, reply, button } = setup()
  await reply({ ...plugin(), compatible: { ok: false, reason: 'Requires Histoire >=2.0.0' } })
  expect(button('Install').attributes('disabled')).toBeDefined()
  expect(wrapper.text()).toContain('Requires Histoire >=2.0.0')
  await button('Install').trigger('click')
  expect(store.installRequest.value).toBeUndefined()
})

it.each([
  ['https://github.com/histoire-dev/histoire/tree/main/packages/histoire-plugin-a11y', 'https://github.com/histoire-dev/histoire/releases'],
  ['https://gitlab.com/team/plugins/-/tree/main/a11y', 'https://gitlab.com/team/plugins/-/releases'],
])('links repository releases from package subdirectory %s', async (repoUrl, expected) => {
  const { wrapper, reply } = setup()
  await reply({ ...plugin(), repoUrl })
  await wrapper.findAll('[role="tab"]')[2].trigger('click')
  expect(wrapper.get('a[aria-label="Repository releases"]').attributes('href')).toBe(expected)
})

it('shows installed version and requests update target rather than latest', async () => {
  const { wrapper, store, reply, button } = setup()
  await reply({ ...plugin(), installed: { version: '1.0.0', enabled: true, required: false, update: '1.5.0' } })
  expect(wrapper.text()).toContain('Installed 1.0.0')
  await button('Update to 1.5.0').trigger('click')
  expect(store.installRequest.value).toMatchObject({ kind: 'update', version: '1.5.0', id: '@histoire/plugin-a11y' })
})
it('keeps installed plugins without updates out of install flow', async () => {
  const { store, reply, button } = setup()
  await reply({ ...plugin(), installed: { version: '2.0.0', enabled: true, required: false } })
  expect(button('Installed 2.0.0').attributes('disabled')).toBeDefined()
  expect(store.installRequest.value).toBeUndefined()
})
it('shows declared provenance, logo and empty tab states only when supported by metadata', async () => {
  const { wrapper, reply } = setup()
  const detail = plugin()
  detail.manifest.config.options = []
  await reply({ ...detail, provenance: true, logoUrl: 'https://example.com/a11y.svg', releaseNotes: [], versions: [], adds: [] })
  expect(wrapper.get('img').attributes('src')).toBe('https://example.com/a11y.svg')
  expect(wrapper.text()).toContain('Published with npm provenance')
  for (const [index, title] of [[1, 'No options'], [2, 'No release notes'], [3, 'No versions']] as const) {
    await wrapper.findAll('[role="tab"]')[index].trigger('click')
    expect(wrapper.get('[role="tabpanel"]:not([hidden]) [role="status"]').text()).toContain(title)
  }
})

// Lifetime: held channel replies must not publish across package, close or unmount.
it('retries failures and never publishes an obsolete package response', async () => {
  const { wrapper, store, channel, request, reply } = setup()
  await nextTick()
  expect(wrapper.get('[role="status"]').text()).toContain('Loading plugin')
  const old = request()
  channel.emit('histoire:ui:marketplace-detail-result', { requestId: old.requestId, error: { code: 'failed', message: 'Registry unavailable' } })
  await flushMicrotasks(6)
  expect(wrapper.get('[role="alert"]').text()).toContain('Registry unavailable')
  await wrapper.get('button[aria-label="Retry"]').trigger('click')
  const pending = request()
  store.showPlugin('@histoire/plugin-designs')
  await nextTick()
  channel.emit('histoire:ui:marketplace-detail-result', { requestId: pending.requestId, detail: plugin() })
  await flushMicrotasks(6)
  expect(wrapper.find('h1').exists()).toBe(false)
  await reply({ ...plugin(), id: '@histoire/plugin-designs', displayName: 'Designs' })
  expect(wrapper.get('h1').text()).toBe('Designs')
})

it('clears detail and detaches pending listeners when closed or unmounted', async () => {
  const { wrapper, store, channel, reply, request } = setup()
  await reply()
  store.prefs.value.community = true
  await nextTick()
  const pending = request()
  expect(pending.prefs.community).toBe(true)
  store.close()
  await nextTick()
  expect(wrapper.find('h1').exists()).toBe(false)
  expect(channel.listenerCount()).toBe(0)
  channel.emit('histoire:ui:marketplace-detail-result', { requestId: pending.requestId, detail: plugin() })
  await flushMicrotasks(6)
  expect(wrapper.find('h1').exists()).toBe(false)
  store.openMarketplace()
  store.showPlugin('@histoire/plugin-a11y')
  await nextTick()
  expect(channel.listenerCount()).toBeGreaterThan(0)
  wrapper.unmount()
  store.dispose()
  expect(channel.listenerCount()).toBe(0)
})

it.each([
  ['not-found', 'Package no longer listed', true],
  ['failed', 'Plugin not found', false],
] as const)('uses error code %s to choose missing or retryable state', async (code, message, missing) => {
  const { wrapper, channel, request } = setup()
  await nextTick()
  channel.emit('histoire:ui:marketplace-detail-result', { requestId: request().requestId, error: { code, message } })
  await flushMicrotasks(6)
  if (missing) expect(wrapper.get('[role="status"]').text()).toContain('Plugin not found')
  else expect(wrapper.get('[role="alert"]').text()).toContain('Plugin not found')
  expect(wrapper.find('[role="alert"]').exists()).toBe(!missing)
})
