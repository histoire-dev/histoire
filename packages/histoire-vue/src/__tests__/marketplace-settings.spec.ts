import type { PluginDetail } from '../../../histoire-shared/src/index.js'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMarketplaceStore } from '../../../histoire-app/src/app/stores/marketplace.js'
import { createUiSettingsStore } from '../../../histoire-app/src/app/stores/settings.js'
import { flushMicrotasks } from '../../../histoire/src/node/__tests__/utils/flush.js'
import { plugins, updates } from './marketplace-settings/data.js'
import { settingsFixture } from './marketplace-settings/fixture.js'
import { officialPlugins } from './utils/marketplace-official.js'
import { stubMarketplaceSession } from './utils/marketplace-transport.js'

vi.mock('virtual:$histoire-config', async () => ({ config: { theme: {} }, logos: {}, installedPlugins: (await import('./marketplace-settings/data.js')).plugins }))

beforeEach(stubMarketplaceSession)

const cleanups: (() => unknown)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  sessionStorage.removeItem('_histoire-marketplace-acknowledged:/')
  document.body.innerHTML = ''
})

it('shows installed identities, required/local state and opens marketplace with its opener', async () => {
  const f = await settingsFixture()
  cleanups.push(f.dispose)
  await f.replyUpdates()
  expect(f.wrapper.get('h1').text()).toBe('Plugins')
  expect(f.wrapper.text()).toContain('Plugin changes write to package.json and histoire.config.ts')
  expect(f.wrapper.text()).toContain('@histoire/plugin-a11y')
  expect(f.wrapper.text()).toContain('1.1.0')
  expect(f.wrapper.text()).toContain('local')
  expect(f.wrapper.text()).toContain('Required')
  expect(f.wrapper.find('[aria-label="Enable Vue"]').exists()).toBe(false)
  expect(f.wrapper.find('[aria-label="Enable Accessibility"]').exists()).toBe(true)
  await f.button('Update to 1.1.1').trigger('click')
  expect(f.store.updateTarget.value).toBe('@histoire/plugin-a11y')
  const opener = f.button('Browse marketplace')
  await opener.trigger('click')
  expect(f.store.open.value).toBe(true)
  expect(f.store.view.value).toBe('discover')
  expect(f.store.opener.value).toBe(opener.element)
})

it('persists all marketplace preferences while retaining other settings', async () => {
  const f = await settingsFixture()
  cleanups.push(f.dispose)
  f.settings.update({ density: 'compact' })
  await f.replyUpdates([])
  expect(f.wrapper.findAll('button').some(item => item.text() === 'Update all')).toBe(false)
  await f.wrapper.get('[role="switch"][aria-label="Community plugins"]').setValue(true)
  await f.button('pnpm').trigger('click')
  await f.button('Ask').trigger('click')
  const nextSettings = createUiSettingsStore({ storage: f.storage })
  const nextStore = createMarketplaceStore({ settings: nextSettings })
  cleanups.push(nextStore.dispose)
  expect(nextStore.prefs.value).toEqual({ community: true, packageManager: 'pnpm', afterInstall: 'ask', skippedVersions: {} })
  expect(nextSettings.state.density).toBe('compact')
  expect(f.request('updates').prefs.community).toBe(true)
})

// Real row, store and channel: gear must open its own plugin, without project writes.
it('opens plugin options directly from its installed row', async () => {
  const f = await settingsFixture({ detail: true })
  cleanups.push(f.dispose)
  await f.replyUpdates()
  expect(f.button('Options for Vue').exists()).toBe(true)
  await f.button('Options for Accessibility').trigger('click')
  await flushMicrotasks(10)
  expect(f.store.view.value).toBe('detail')
  expect(f.store.detailTab.value).toBe('options')
  expect(f.request('detail').id).toBe('@histoire/plugin-a11y')
  expect(f.channel.sent.some(item => item.event === 'histoire:ui:marketplace-job-start')).toBe(false)
})

it('confirms removal, keeps links and supports keyboard menu dismissal', async () => {
  const f = await settingsFixture()
  cleanups.push(f.dispose)
  await f.replyUpdates()
  await f.button('More actions for Accessibility').trigger('keydown', { key: 'ArrowDown' })
  await flushMicrotasks(10)
  const menu = document.querySelector('[role="menu"]')!
  expect(menu).not.toBeNull()
  expect(menu.querySelector('a[aria-label="Documentation for Accessibility"]')?.getAttribute('href')).toBe('https://example.com/docs')
  expect(menu.querySelector('a[aria-label="Repository for Accessibility"]')?.getAttribute('href')).toBe('https://example.com/repo')
  const remove = [...menu.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === 'Remove')!
  remove.click()
  await flushMicrotasks(10)
  expect(menu.textContent).toContain('Remove Accessibility?')
  expect(document.activeElement?.textContent?.trim()).toBe('Cancel')
  expect(f.channel.sent.some(item => item.event === 'histoire:ui:marketplace-plan' && item.value.request.kind === 'remove')).toBe(false)
  ;[...menu.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === 'Cancel')!.click()
  await flushMicrotasks(10)
  menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  await flushMicrotasks(10)
  expect(document.activeElement).toBe(f.button('More actions for Accessibility').element)
  await f.button('More actions for Accessibility').trigger('click')
  await flushMicrotasks(10)
  const current = () => document.querySelector('[role="menu"]')!
  const clickRemove = () => [...current().querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === 'Remove')!.click()
  clickRemove()
  await flushMicrotasks(5)
  clickRemove()
  await flushMicrotasks(10)
  expect(f.request('plan').request).toMatchObject({ id: '@histoire/plugin-a11y', kind: 'remove' })
})

it('pins exact installed version and exposes detected manager after a real plan', async () => {
  const f = await settingsFixture()
  cleanups.push(f.dispose)
  await f.replyUpdates()
  await f.button('More actions for Accessibility').trigger('click')
  await flushMicrotasks(10)
  ;[...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(item => item.textContent?.trim() === 'Pin version')!.click()
  await flushMicrotasks(10)
  expect(f.request('plan').request).toMatchObject({ id: '@histoire/plugin-a11y', kind: 'pin', version: '1.1.0' })
  await f.replyPlan()
  expect(f.request('job-start')).toMatchObject({ planId: 'reviewed', hash: 'hash' })
  expect(f.wrapper.text()).toContain('Detected from lockfile')
})

it('retains Required restrictions in menus and exposes read-only static browsing', async () => {
  const f = await settingsFixture({ dev: false })
  cleanups.push(f.dispose)
  expect(f.wrapper.find('[role="switch"]').exists()).toBe(false)
  expect(f.channel.sent.some(item => item.event === 'histoire:ui:marketplace-updates')).toBe(false)
  await f.button('More actions for Vue').trigger('click')
  await flushMicrotasks(10)
  expect(document.querySelector('[role="menu"]')!.textContent).not.toContain('Remove')
  expect(document.querySelector('[role="menu"]')!.textContent).not.toContain('Pin version')
  await f.button('Browse marketplace').trigger('click')
  expect(f.store.open.value).toBe(true)
})

it('marks last installed row New until acknowledged', async () => {
  const f = await settingsFixture()
  cleanups.push(f.dispose)
  await f.replyUpdates([])
  await f.job({ kind: 'install', id: plugins[1].packageName!, status: 'succeeded' }, false)
  expect(f.wrapper.text()).toContain('New')
  await f.button('Acknowledge Accessibility').trigger('click')
  expect(f.wrapper.text()).not.toContain('New')
})

it('detects package manager through a read-only plan probe without admitting a job', async () => {
  const f = await settingsFixture()
  cleanups.push(f.dispose)
  expect(f.request('plan').request).toMatchObject({ id: '@histoire/plugin-vue', kind: 'pin', version: '1.0.0' })
  await f.replyPlan()
  expect(f.wrapper.text()).toContain('Detected from lockfile')
  expect(f.channel.sent.some(item => item.event === 'histoire:ui:marketplace-job-start')).toBe(false)
})

it.each(['Options', 'Changelog'] as const)('opens exact %s detail tab from installed plugin menu', async (tab) => {
  const f = await settingsFixture({ detail: true })
  cleanups.push(f.dispose)
  await f.replyUpdates()
  await f.button('More actions for Vue').trigger('click')
  await flushMicrotasks(10)
  expect(document.querySelector('[role="menu"]')!.textContent).not.toContain('Remove')
  await f.button('More actions for Vue').trigger('click')
  await f.button('More actions for Accessibility').trigger('click')
  await flushMicrotasks(10)
  ;[...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(item => item.textContent?.trim() === tab)!.click()
  await flushMicrotasks(10)
  expect(f.store.view.value).toBe('detail')
  if (tab === 'Options') expect(f.store.installRequest.value).toMatchObject({ id: '@histoire/plugin-a11y', kind: 'options' })
  expect(f.request('detail').id).toBe('@histoire/plugin-a11y')
  f.channel.emit('histoire:ui:marketplace-detail-result', { requestId: f.request('detail').requestId, detail: structuredClone(officialPlugins.find(item => item.id === '@histoire/plugin-a11y')!) as PluginDetail })
  await flushMicrotasks(10)
  expect(f.wrapper.get('[role="tab"][aria-selected="true"]').text()).toBe(tab)
  expect(f.wrapper.get('[role="tabpanel"]:not([hidden])').attributes('aria-labelledby')).toBe(f.wrapper.get('[role="tab"][aria-selected="true"]').attributes('id'))
  if (tab === 'Options') {
    await f.button('Edit options').trigger('click')
    expect(f.store.view.value).toBe('install')
    expect(f.store.installRequest.value).toMatchObject({ id: '@histoire/plugin-a11y', kind: 'options', prefs: { community: false } })
  }
})

// Both real consumers must share request ownership and expose same retained count.
it('shows accessible Plugins update count using shared settings session cache', async () => {
  const f = await settingsFixture({ nav: true })
  cleanups.push(f.dispose)
  expect(f.channel.sent.filter(item => item.event.endsWith('-updates'))).toHaveLength(1)
  await f.replyUpdates()
  expect(f.wrapper.get('nav [aria-label="Plugins, 3 updates available"]').text()).toBe('Plugins 3')
  f.store.prefs.value.skippedVersions = Object.fromEntries(updates.slice(0, 2).map(item => [item.id, item.to]))
  await flushMicrotasks(10)
  expect(f.wrapper.get('nav [aria-label="Plugins, 1 update available"]').text()).toBe('Plugins 1')
  await f.replyUpdates([updates[2]])
  f.store.prefs.value.skippedVersions = Object.fromEntries(updates.map(item => [item.id, item.to]))
  await flushMicrotasks(10)
  expect(f.wrapper.get('nav [aria-label="Plugins"]').text()).toBe('Plugins')
  await f.replyUpdates([])
})
