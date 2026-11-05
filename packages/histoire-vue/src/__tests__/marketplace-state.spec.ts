import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMarketplaceStore } from '../../../histoire-app/src/app/stores/marketplace.js'
import { createUiSettingsStore } from '../../../histoire-app/src/app/stores/settings.js'
import { createMarketplaceClient } from '../../../histoire-app/src/app/util/marketplace-client.js'
import { flushMicrotasks } from '../../../histoire/src/node/__tests__/utils/flush.js'
import { memoryStorage } from '../../../histoire/src/node/__tests__/utils/settings-storage.js'
import { settingsFixture } from './marketplace-settings/fixture.js'
import { createMarketplaceTransport, stubMarketplaceSession } from './utils/marketplace-transport.js'

vi.mock('virtual:$histoire-config', async () => ({ config: { theme: {} }, logos: {}, installedPlugins: (await import('./marketplace-settings/data.js')).plugins }))

const cleanups: (() => unknown)[] = []
beforeEach(stubMarketplaceSession)
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('hydrates marketplace preferences once with settings and persists direct edits and reset', async () => {
  const storage = memoryStorage()
  const saved = { community: true, packageManager: 'npm', afterInstall: 'ask', skippedVersions: { one: '2', invalid: 2 } }
  storage.setItem('_histoire-ui-settings', JSON.stringify({ density: 'compact', syncZoom: true, watchTests: false, marketplace: saved }))
  const read = vi.spyOn(storage, 'getItem')
  const settings = createUiSettingsStore({ storage })
  expect(settings.state.marketplace).toEqual({ ...saved, skippedVersions: { one: '2' } })
  const store = createMarketplaceStore({ settings })
  cleanups.push(store.dispose)
  expect(read.mock.calls.filter(([key]) => key === '_histoire-ui-settings')).toHaveLength(1)
  store.prefs.value.packageManager = 'bun'
  await flushMicrotasks(4)
  expect(createUiSettingsStore({ storage }).state.marketplace.packageManager).toBe('bun')
  settings.reset()
  expect(store.prefs.value).toEqual({ community: false, packageManager: 'auto', afterInstall: 'restart', skippedVersions: {} })
  store.prefs.value.community = true
  await flushMicrotasks(4)
  expect(createUiSettingsStore({ storage }).state.marketplace.community).toBe(true)
})

it('owns update reads without mounted consumers and releases held replies on disposal', async () => {
  const channel = createMarketplaceTransport()
  const store = createMarketplaceStore({ settings: createUiSettingsStore({}), client: createMarketplaceClient({ transport: channel.transport }) })
  cleanups.push(store.dispose)
  store.connect()
  await flushMicrotasks(4)
  const first = channel.sent.find(item => item.event.endsWith('-updates'))
  expect(first).toBeDefined()
  store.dispose()
  expect(channel.listenerCount()).toBe(0)
  channel.emit('histoire:ui:marketplace-updates-result', { requestId: first!.value.requestId, updates: [{ id: 'held', from: '1', to: '2', breaking: false }] })
  await flushMicrotasks(4)
  expect(store.updates.available.value).toEqual([])
  await store.updates.refresh(true)
  expect(channel.sent.filter(item => item.event.endsWith('-updates'))).toHaveLength(1)
  const fresh = createMarketplaceStore({ settings: createUiSettingsStore({}), client: createMarketplaceClient({ transport: channel.transport }) })
  cleanups.push(fresh.dispose)
  fresh.connect()
  const pending = channel.sent.filter(item => item.event.endsWith('-updates')).at(-1)!
  const updates = [{ id: 'one', from: '1', to: '2', breaking: false }, { id: 'two', from: '2', to: '3', breaking: true }]
  channel.emit('histoire:ui:marketplace-updates-result', { requestId: first!.value.requestId, updates: [] })
  channel.emit('histoire:ui:marketplace-updates-result', { requestId: pending.value.requestId, updates })
  await flushMicrotasks(4)
  expect(fresh.updates.available.value).toEqual(updates)
  expect(store.updates.available.value).toEqual([])
})

it('advances every queued settings update after section unmount without a rail keep-alive', async () => {
  const f = await settingsFixture()
  cleanups.push(f.dispose)
  await f.replyUpdates()
  await f.button('Update all').trigger('click')
  await f.replyPlan()
  await f.job()
  f.wrapper.unmount()
  await f.job({ status: 'succeeded', steps: [{ id: 'load', state: 'done' }] }, false)
  expect(f.request('plan').request).toMatchObject({ kind: 'update', id: '@histoire/plugin-designs', version: '1.2.1' })
  await f.replyPlan()
  await f.job({ jobId: 'second', id: '@histoire/plugin-designs', version: '1.2.1' })
  await f.job({ jobId: 'second', id: '@histoire/plugin-designs', version: '1.2.1', status: 'succeeded' }, false)
  expect(f.channel.sent.filter(item => item.event.endsWith('-job-start'))).toHaveLength(2)
  expect(f.store.job.value).toMatchObject({ jobId: 'second', status: 'succeeded' })
})

it('discards recovered queue when server receipt belongs to different work', async () => {
  const first = await settingsFixture()
  cleanups.push(first.dispose)
  await first.replyUpdates()
  await first.button('Update all').trigger('click')
  await first.replyPlan()
  await first.job()
  await first.dispose()
  const fresh = await settingsFixture()
  cleanups.push(fresh.dispose)
  await fresh.job({ jobId: 'foreign', id: 'other', status: 'succeeded' }, false)
  const pin = fresh.store.settingsJobs.run({ kind: 'pin', id: '@histoire/plugin-a11y', version: '1.1.0', prefs: fresh.store.prefs.value })
  await fresh.replyPlan()
  await fresh.job({ jobId: 'pin', kind: 'pin', version: '1.1.0' })
  await pin
  await fresh.job({ jobId: 'pin', kind: 'pin', version: '1.1.0', status: 'succeeded' }, false)
  expect(fresh.channel.sent.filter(item => item.event.endsWith('-plan') && item.value.request.kind === 'update')).toEqual([])
  expect(fresh.store.job.value).toMatchObject({ jobId: 'pin', kind: 'pin', status: 'succeeded' })
})
