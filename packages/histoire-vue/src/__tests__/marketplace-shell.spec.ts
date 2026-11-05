import type { ChangePlan, ChangeRequest, JobState } from '../../../histoire-shared/src/index.js'
import { mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import PluginTile from '../../../histoire-app/src/app/components/marketplace/shell/PluginTile.vue'
import { createMarketplaceStore } from '../../../histoire-app/src/app/stores/marketplace.js'
import { createUiSettingsStore } from '../../../histoire-app/src/app/stores/settings.js'
import { createMarketplaceClient } from '../../../histoire-app/src/app/util/marketplace-client.js'
import { flushMicrotasks } from '../../../histoire/src/node/__tests__/utils/flush.js'
import { setup, storage } from './marketplace-shell/fixture.js'
import { flushCatalog } from './utils/marketplace-transport.js'

const cleanups: (() => unknown)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
  vi.unstubAllGlobals()
})

it('opens a labelled modal, closes with Escape and restores opener focus', async () => {
  const { wrapper, dialog, store } = setup(cleanups)
  const opener = wrapper.get('button')
  ;(opener.element as HTMLElement).focus()
  await opener.trigger('click')
  await nextTick()
  expect(dialog.open).toBe(true)
  expect(dialog.getAttribute('role')).toBe('dialog')
  expect(dialog.getAttribute('aria-modal')).toBe('true')
  expect(wrapper.get(`#${dialog.getAttribute('aria-labelledby')}`).text()).toBe('Plugin marketplace')
  expect(wrapper.text()).toContain('Discover')
  await wrapper.get('dialog').trigger('keydown', { key: 'Escape' })
  await nextTick()
  expect(dialog.open).toBe(false)
  expect(store.open.value).toBe(false)
  expect(document.activeElement).toBe(opener.element)
  await opener.trigger('click')
  await nextTick()
  // Native close events can arrive after another action has reopened the modal.
  dialog.dispatchEvent(new Event('close'))
  expect(store.open.value).toBe(true)
  dialog.dispatchEvent(new Event('cancel', { cancelable: true }))
  await nextTick()
  expect(dialog.open).toBe(false)
  expect(document.activeElement).toBe(opener.element)
})

it('keeps search across navigation and gives slash to editable fields', async () => {
  const { wrapper, store } = setup(cleanups)
  await wrapper.get('button').trigger('click')
  await nextTick()
  const search = wrapper.get('input[aria-label="Search plugins"]')
  const all = wrapper.get('button[aria-label="All plugins"]')
  const discover = wrapper.get('button[aria-label="Discover"]')
  expect(discover.attributes('aria-pressed')).toBe('true')
  ;(all.element as HTMLElement).focus()
  await all.trigger('keydown', { key: '/' })
  expect(document.activeElement).toBe(search.element)
  const typing = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true })
  search.element.dispatchEvent(typing)
  expect(typing.defaultPrevented).toBe(false)
  await search.setValue('accessibility')
  expect(store.view.value).toBe('all')
  expect(all.attributes('aria-pressed')).toBe('true')
  await discover.trigger('click')
  expect(store.query.value).toBe('accessibility')
  expect((search.element as HTMLInputElement).value).toBe('accessibility')
  await wrapper.get('button[aria-label="Clear search"]').trigger('click')
  expect(store.query.value).toBe('')
})

it('returns through install and detail breadcrumbs without changing search', async () => {
  const { wrapper, store, channel } = setup(cleanups, true)
  store.openMarketplace('all')
  store.setQuery('design')
  store.showPlugin('@histoire/plugin-designs')
  store.startInstall({ id: '@histoire/plugin-designs', kind: 'install', prefs: store.prefs.value })
  await nextTick()
  expect(store.view.value).toBe('install')
  expect(wrapper.text()).toContain('Install')
  await wrapper.get('nav[aria-label="Install breadcrumb"]').findAll('button')[1].trigger('click')
  expect(store.view.value).toBe('detail')
  expect(store.selectedId.value).toBe('@histoire/plugin-designs')
  // Detail owns its breadcrumb; settle real metadata before navigating it.
  const offline = createMarketplaceClient({ transport: { ...channel.transport, available: () => false } })
  const detail = await offline.detail('@histoire/plugin-designs', store.prefs.value)
  const request = channel.sent.filter(item => item.event === 'histoire:ui:marketplace-detail').at(-1)!
  channel.emit('histoire:ui:marketplace-detail-result', { requestId: request.value.requestId, detail })
  await flushMicrotasks(5)
  await wrapper.get('nav[aria-label="Plugin breadcrumb"]').findAll('button')[0].trigger('click')
  expect(store.view.value).toBe('all')
  expect(store.query.value).toBe('design')
})

it('routes manual plans and update targets through owner-scoped state', async () => {
  const { store, wrapper } = setup(cleanups)
  const plan: ChangePlan = { planId: 'manual', hash: '', packageManager: { name: 'npm', source: 'override' }, files: [], warnings: [], manual: { reason: 'static', steps: [] } }
  const request: ChangeRequest = { id: '@histoire/plugin-a11y', kind: 'install', prefs: store.prefs.value }
  store.startInstall(request)
  store.showManual(plan)
  await nextTick()
  expect(store.open.value).toBe(true)
  expect(store.view.value).toBe('manual')
  expect(store.manualPlan.value).toEqual(plan)
  expect(wrapper.get('h1').text()).toBe('Install @histoire/plugin-a11y manually')
  store.back()
  expect(store.view.value).toBe('install')
  store.openUpdate('@histoire/plugin-a11y')
  expect(store.updateTarget.value).toBe('@histoire/plugin-a11y')
})

it('persists marketplace preferences alongside existing UI settings', async () => {
  storage.removeItem('_histoire-ui-settings')
  const settings = createUiSettingsStore({ storage })
  settings.update({ density: 'compact', syncZoom: true })
  const first = createMarketplaceStore({ settings, storage })
  cleanups.push(first.dispose)
  first.prefs.value.community = true
  first.prefs.value.packageManager = 'pnpm'
  first.prefs.value.skippedVersions['@histoire/plugin-a11y'] = '2.0.0'
  first.prefs.value = { ...first.prefs.value, afterInstall: 'ask' }
  await nextTick()
  settings.update({ watchTests: true })
  const secondSettings = createUiSettingsStore({ storage })
  const second = createMarketplaceStore({ settings: secondSettings, storage })
  cleanups.push(second.dispose)
  expect(second.prefs.value).toEqual({ community: true, packageManager: 'pnpm', afterInstall: 'ask', skippedVersions: { '@histoire/plugin-a11y': '2.0.0' } })
  expect(secondSettings.state).toMatchObject({ density: 'compact', syncZoom: true, watchTests: true })
  expect(JSON.parse(storage.getItem('_histoire-ui-settings')!).marketplace).toEqual(second.prefs.value)
  secondSettings.reset()
  expect(second.prefs.value).toEqual({ community: false, packageManager: 'auto', afterInstall: 'restart', skippedVersions: {} })
  expect(JSON.parse(storage.getItem('_histoire-ui-settings')!).marketplace).toEqual(second.prefs.value)
  storage.removeItem('_histoire-ui-settings')
})

it('recovers jobs once, observes updates while closed, and releases listeners on unmount', async () => {
  const { channel, store, wrapper } = setup(cleanups)
  const current = channel.sent.filter(item => item.event === 'histoire:ui:marketplace-job-current')
  expect(current).toHaveLength(1)
  const job: JobState = { jobId: 'running', kind: 'install', id: '@histoire/plugin-a11y', version: '1.0.0', steps: [], status: 'running', output: ['Installing'] }
  channel.emit('histoire:ui:marketplace-job-state', { requestId: current[0].value.requestId, job })
  await nextTick()
  expect(store.job.value).toEqual(job)
  store.openMarketplace()
  store.close()
  store.openMarketplace()
  expect(channel.sent.filter(item => item.event === 'histoire:ui:marketplace-job-current')).toHaveLength(1)
  channel.emit('histoire:ui:marketplace-job-state', { job: { ...job, status: 'succeeded', output: ['Loaded'] } })
  expect(store.job.value?.status).toBe('succeeded')
  wrapper.unmount()
  expect(channel.listenerCount()).toBe(0)
  channel.emit('histoire:ui:marketplace-job-state', { job: { ...job, status: 'failed' } })
  expect(store.job.value?.status).toBe('succeeded')
})

it('sends current browse state and ignores replies from retired searches or closed visits', async () => {
  const { store, channel } = setup(cleanups)
  store.openMarketplace('discover')
  await flushCatalog()
  const first = channel.sent.find(item => item.event === 'histoire:ui:marketplace-catalog')!
  expect(first.value.query).toMatchObject({ view: 'discover', query: '', prefs: { community: false } })
  store.setQuery('axe')
  store.setFilters({ category: 'testing', frameworks: ['vue'] })
  store.prefs.value.community = true
  await flushCatalog()
  const latest = channel.sent.filter(item => item.event === 'histoire:ui:marketplace-catalog').at(-1)!
  expect(latest.value.query).toMatchObject({ view: 'all', query: 'axe', filters: { category: 'testing', frameworks: ['vue'] }, prefs: { community: true } })
  channel.emit('histoire:ui:marketplace-catalog-result', { requestId: first.value.requestId, error: { code: 'failed', message: 'Old search failed' } })
  await flushCatalog()
  expect(store.error.value).toBeUndefined()
  expect(store.loading.value).toBe(true)
  channel.emit('histoire:ui:marketplace-catalog-result', { requestId: latest.value.requestId, error: { code: 'failed', message: 'Registry unavailable' } })
  await flushMicrotasks(5)
  expect(store.error.value).toBe('Registry unavailable')
  expect(store.loading.value).toBe(false)
  const retry = store.loadCatalog()
  await flushCatalog()
  expect(store.error.value).toBeUndefined()
  const pending = channel.sent.at(-1)!
  store.close()
  channel.emit('histoire:ui:marketplace-catalog-result', { requestId: pending.value.requestId, error: { code: 'failed', message: 'Closed search failed' } })
  await retry
  expect(store.error.value).toBeUndefined()
  expect(store.loading.value).toBe(false)
})

it('cancels recovery listeners on unmount even before the first job reply', async () => {
  const { wrapper, store, channel } = setup(cleanups)
  const current = channel.sent[0]
  wrapper.unmount()
  expect(channel.listenerCount()).toBe(0)
  channel.emit('histoire:ui:marketplace-job-state', { requestId: current.value.requestId, job: { jobId: 'late', kind: 'install', id: '@histoire/plugin-a11y', version: '1', steps: [], output: [], status: 'running' } })
  await nextTick()
  expect(store.job.value).toBeUndefined()
})

it('keeps a readable monogram after a failed logo and retries a different logo', async () => {
  const wrapper = mount(PluginTile, { props: { plugin: { displayName: 'Accessibility', monogram: 'Ax', tint: 'blue', logoUrl: 'https://example.com/axe.svg' } } })
  cleanups.push(() => wrapper.unmount())
  await wrapper.get('img').trigger('error')
  expect(wrapper.find('img').exists()).toBe(false)
  expect(wrapper.text()).toBe('Ax')
  await wrapper.setProps({ plugin: { displayName: 'Designs', monogram: 'De', tint: 'violet', logoUrl: 'https://example.com/designs.svg' } })
  expect(wrapper.get('img').attributes('src')).toBe('https://example.com/designs.svg')
})

it('publishes catalog results and keeps usable data after a failed refresh', async () => {
  const { store, channel } = setup(cleanups)
  const offline = createMarketplaceClient({ transport: { ...channel.transport, available: () => false } })
  const page = await offline.catalog({ view: 'all', prefs: store.prefs.value })
  const expected = structuredClone(page)
  store.openMarketplace('all')
  await flushCatalog()
  const request = channel.sent.at(-1)!
  channel.emit('histoire:ui:marketplace-catalog-result', { requestId: request.value.requestId, page })
  await flushMicrotasks(5)
  expect(store.page.value).toEqual(expected)
  expect(store.page.value?.entries).toHaveLength(10)
  store.setQuery('a11y')
  await flushCatalog()
  const refresh = channel.sent.at(-1)!
  channel.emit('histoire:ui:marketplace-catalog-result', { requestId: refresh.value.requestId, error: { code: 'failed', message: 'Refresh failed' } })
  await flushMicrotasks(5)
  expect(store.page.value).toEqual(expected)
  expect(store.error.value).toBe('Refresh failed')
})

it('recovers malformed saved marketplace fields without discarding valid preferences', () => {
  storage.setItem('_histoire-ui-settings', JSON.stringify({ density: 'compact', syncZoom: false, watchTests: false, marketplace: { community: true, packageManager: { toString: 2 }, afterInstall: 'invalid', skippedVersions: { valid: '2.0.0', invalid: 2 } } }))
  const settings = createUiSettingsStore({ storage })
  const store = createMarketplaceStore({ settings, storage })
  cleanups.push(store.dispose)
  expect(store.prefs.value).toEqual({ community: true, packageManager: 'auto', afterInstall: 'restart', skippedVersions: { valid: '2.0.0' } })
  expect(settings.state.density).toBe('compact')
  storage.removeItem('_histoire-ui-settings')
})
