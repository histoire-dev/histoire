import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMarketplaceStore } from '../../../../histoire-app/src/app/stores/marketplace.js'
import { createUiSettingsStore } from '../../../../histoire-app/src/app/stores/settings.js'
import { createMarketplaceClient } from '../../../../histoire-app/src/app/util/marketplace-client.js'
import { flushMicrotasks } from '../../../../histoire/src/node/__tests__/utils/flush.js'
import { createMarketplaceTransport, stubMarketplaceSession } from '../utils/marketplace-transport.js'
import { job, plan, setup } from './fixtures.js'

vi.mock('virtual:$histoire-config', () => ({ installedPlugins: [] }))
const cleanups: (() => unknown)[] = []
beforeEach(stubMarketplaceSession)
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// Real reviewed wizard, store and client. Dismissal removes wizard observers;
// opposite current preference catches using mutable defaults instead of reviewed policy.
it.each(['restart', 'ask'] as const)('retains reviewed %s policy and destination after dismissal and reload', async (policy) => {
  const f = setup(cleanups)
  await f.ready()
  await f.button('Continue').trigger('click')
  if (policy === 'ask') {
    await f.wrapper.get('[role="checkbox"][aria-label="Restart dev server when done"]').trigger('click')
    await vi.waitFor(() => expect(f.request().request.prefs.afterInstall).toBe('ask'))
    f.channel.emit('histoire:ui:marketplace-plan-result', { requestId: f.request().requestId, plan: plan('2') })
    await flushMicrotasks(6)
  }
  await f.wrapper.get('[role="checkbox"][aria-label^="Open "]').trigger('click')
  await f.button('Install').trigger('click')
  if (policy === 'ask') {
    f.store.close()
    f.wrapper.unmount()
  }
  f.channel.emit('histoire:ui:marketplace-job-state', { requestId: f.request('job-start').requestId, job: job() })
  await flushMicrotasks(6)
  expect(f.store.postInstall.value).toEqual({ jobId: 'job-1', pluginId: '@histoire/plugin-a11y', openPane: 'issues' })
  f.store.prefs.value.afterInstall = policy === 'restart' ? 'ask' : 'restart'
  if (policy === 'restart') {
    await f.button('Run in background').trigger('click')
    expect(f.store.view.value).toBe('all')
  }
  else {
    f.store.close()
  }
  f.wrapper.unmount()
  f.channel.emit('histoire:ui:marketplace-job-state', { job: job({ awaiting: 'restart' }) })
  await flushMicrotasks(6)
  f.store.dispose()

  // Fresh owner reads session receipt, then real currentJob response restores flow.
  const channel = createMarketplaceTransport()
  const store = createMarketplaceStore({ client: createMarketplaceClient({ transport: channel.transport }), settings: createUiSettingsStore({ storage: f.storage }) })
  cleanups.push(store.dispose)
  store.connect()
  channel.emit('histoire:ui:marketplace-job-state', { requestId: channel.sent[0].value.requestId, job: job({ awaiting: 'restart' }) })
  await flushMicrotasks(6)
  channel.emit('histoire:ui:marketplace-job-state', { job: job({ status: 'succeeded', steps: [{ id: 'load', state: 'done' }] }) })
  await flushMicrotasks(6)
  expect(store.postInstall.value).toEqual({ jobId: 'job-1', pluginId: '@histoire/plugin-a11y', openPane: 'issues' })
  expect(store.installRequest.value).toMatchObject({ kind: 'install', id: '@histoire/plugin-a11y', prefs: { afterInstall: policy } })
  expect(store.view.value).toBe('install')
  expect(store.open.value).toBe(true)
})

it('retires held admission when workbench ends without cancelling server work', async () => {
  const f = setup(cleanups)
  await f.ready()
  await f.button('Continue').trigger('click')
  await f.button('Install').trigger('click')
  const requestId = f.request('job-start').requestId
  f.store.close()
  f.wrapper.unmount()
  expect(f.channel.listenerCount()).toBeGreaterThan(0)
  f.store.dispose()
  await flushMicrotasks(6)
  expect(f.channel.listenerCount()).toBe(0)
  f.channel.emit('histoire:ui:marketplace-job-state', { requestId, job: job() })
  await flushMicrotasks(6)
  expect(f.store.postInstall.value).toBeUndefined()
  expect(f.channel.sent.some(item => item.event.endsWith('-job-cancel'))).toBe(false)
})
