import { mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import MarketplaceUpdateDialog from '../../../histoire-app/src/app/components/marketplace/update/MarketplaceUpdateDialog.vue'
import { usePluginUpdates } from '../../../histoire-app/src/app/components/pages/settings/plugins/use-plugin-updates.js'
import { createMarketplaceStore, provideMarketplaceStore } from '../../../histoire-app/src/app/stores/marketplace.js'
import { createUiSettingsStore } from '../../../histoire-app/src/app/stores/settings.js'
import { createMarketplaceClient } from '../../../histoire-app/src/app/util/marketplace-client.js'
import { flushMicrotasks } from '../../../histoire/src/node/__tests__/utils/flush.js'
import { memoryStorage } from '../../../histoire/src/node/__tests__/utils/settings-storage.js'
import { job, plan, plugin } from './marketplace-install/fixtures.js'
import { createMarketplaceTransport, stubMarketplaceSession } from './utils/marketplace-transport.js'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** Real dialog/store/client; external channel and missing native top layer are substitutes. */
function setup() {
  stubMarketplaceSession()
  const channel = createMarketplaceTransport()
  const storage = memoryStorage()
  const store = createMarketplaceStore({ client: createMarketplaceClient({ transport: channel.transport }), settings: createUiSettingsStore({ storage }), storage })
  const Host = defineComponent(() => {
    provideMarketplaceStore(store)
    store.connect()
    const updates = usePluginUpdates(store, true)
    return () => [h('output', { 'aria-label': 'Available updates' }, updates.count.value), h('button', { onClick: () => store.openUpdate('@histoire/plugin-a11y') }, 'Update plugin'), h(MarketplaceUpdateDialog, { transport: channel.transport })]
  })
  const wrapper = mount(Host, { attachTo: document.body })
  cleanups.push(() => {
    wrapper.unmount()
    store.dispose()
  })
  const dialog = wrapper.find('dialog').exists() ? wrapper.get('dialog').element as HTMLDialogElement : undefined
  if (dialog) {
    dialog.showModal = () => {
      dialog.open = true
    }
    dialog.close = () => {
      dialog.open = false
    }
  }
  /** Exact action name independent of component classes. */
  function button(name: string) {
    const result = wrapper.findAll('button').find(button => button.text().trim() === name)
    if (!result) throw new Error(`Missing button ${name}`)
    return result
  }
  /** Last exact external request. */
  function request(event: string) {
    const value = channel.sent.filter(item => item.event === `histoire:ui:marketplace-${event}`).at(-1)?.value
    if (!value) throw new Error(`Missing ${event} request`)
    return value
  }
  /** Supply update metadata, retaining target-specific ordered notes and migration. */
  async function ready(review = plan()) {
    (button('Update plugin').element as HTMLElement).focus()
    await button('Update plugin').trigger('click')
    channel.emit('histoire:ui:marketplace-updates-result', { requestId: request('updates').requestId, updates: [{ id: '@histoire/plugin-a11y', from: '0.3.0', to: '1.0.0', breaking: true }] })
    const detail = plugin()
    detail.latest = '1.0.0'
    detail.installed = { version: '0.3.0', enabled: true, required: false, update: '1.0.0' }
    detail.releaseNotes = [{ kind: 'breaking', text: 'Rename token option' }, { kind: 'feature', text: 'Token groups' }, { kind: 'fix', text: 'Keep alias imports' }]
    detail.manifest.migrations = [{ from: '<1', ops: [{ op: 'rename-option', from: 'token', to: 'accessToken' }] }]
    channel.emit('histoire:ui:marketplace-update-detail-result', { requestId: request('update-detail').requestId, detail })
    await flushMicrotasks(6)
    channel.emit('histoire:ui:marketplace-plan-result', { requestId: request('plan').requestId, plan: review })
    await flushMicrotasks(6)
  }
  return { wrapper, store, storage, channel, button, request, ready }
}

it('shows release notes and exact migration diff; opt-out retires old review before replanning', async () => {
  vi.useFakeTimers()
  const fixture = setup()
  await fixture.ready()
  const { wrapper, request, channel, button } = fixture
  expect(wrapper.get('[role="dialog"]').attributes('aria-modal')).toBe('true')
  expect(wrapper.text()).toContain('Update Accessibility')
  expect(wrapper.text()).toContain('0.3.0 → 1.0.0')
  expect(wrapper.text()).toContain('Breaking')
  expect(wrapper.text()).toContain('New')
  expect(wrapper.text()).toContain('Fix')
  expect(wrapper.text()).toContain('Keep alias imports')
  expect(wrapper.get('[aria-label="histoire.config.ts"]').text()).toContain('HstA11y({ test: false })')
  expect(request('plan').request).toMatchObject({ kind: 'update', version: '1.0.0', migrate: true })
  const checkbox = wrapper.get('[role="checkbox"][aria-label="Apply config migration"]')
  expect(checkbox.attributes('aria-checked')).toBe('true')
  await checkbox.trigger('keydown', { key: ' ' })
  expect(checkbox.attributes('aria-checked')).toBe('false')
  expect(button('Update').attributes('disabled')).toBeDefined()
  expect(wrapper.text()).toContain('Config may need manual edits')
  await vi.advanceTimersByTimeAsync(200)
  expect(request('plan').request.migrate).toBe(false)
  channel.emit('histoire:ui:marketplace-plan-result', { requestId: request('plan').requestId, plan: { ...plan('2'), files: [] } })
  await flushMicrotasks(6)
  expect(wrapper.find('[aria-label="histoire.config.ts"]').exists()).toBe(false)
  await button('Update').trigger('click')
  expect(request('job-start')).toMatchObject({ planId: 'plan-2', hash: 'hash-2' })
})

it('persists skipped target, removes update count and returns focus without admitting a job', async () => {
  const { ready, button, store, storage, channel, wrapper } = setup()
  await ready()
  expect(wrapper.get('[aria-label="Available updates"]').text()).toBe('1')
  await button('Skip this version').trigger('click')
  await nextTick()
  expect(store.updateTarget.value).toBeUndefined()
  expect(wrapper.get('[aria-label="Available updates"]').text()).toBe('0')
  expect(store.prefs.value.skippedVersions['@histoire/plugin-a11y']).toBe('1.0.0')
  const nextStore = createMarketplaceStore({ settings: createUiSettingsStore({ storage }), storage })
  cleanups.push(nextStore.dispose)
  expect(nextStore.prefs.value.skippedVersions['@histoire/plugin-a11y']).toBe('1.0.0')
  expect(channel.sent.some(item => item.event === 'histoire:ui:marketplace-job-start')).toBe(false)
  expect(document.activeElement).toBe(wrapper.get('button').element)
})

it('keeps compact progress until successful load and hands failed jobs to modal failure flow', async () => {
  const { ready, button, channel, request, store, wrapper } = setup()
  await ready()
  await button('Update').trigger('click')
  channel.emit('histoire:ui:marketplace-job-state', { requestId: request('job-start').requestId, job: job({ kind: 'update' }) })
  await flushMicrotasks(6)
  expect(wrapper.get('[aria-live="polite"]').text()).toContain('Installing package')
  expect(store.updateTarget.value).toBe('@histoire/plugin-a11y')
  channel.emit('histoire:ui:marketplace-job-state', { job: job({ kind: 'update', status: 'failed', failure: { code: 'load', message: 'Plugin failed to load', restored: false, leftovers: ['node_modules'] } }) })
  await flushMicrotasks(6)
  expect(store.updateTarget.value).toBeUndefined()
  expect(store.open.value).toBe(true)
  expect(store.view.value).toBe('install')
  expect(store.installRequest.value).toMatchObject({ kind: 'update', migrate: true, version: '1.0.0' })
  expect(store.job.value?.failure?.message).toBe('Plugin failed to load')
})

it('ignores late metadata after dismissal and fresh visit remains usable', async () => {
  const { button, request, channel, store, wrapper, ready } = setup()
  await button('Update plugin').trigger('click')
  const old = request('update-detail')
  await wrapper.get('dialog').trigger('keydown', { key: 'Escape' })
  channel.emit('histoire:ui:marketplace-update-detail-result', { requestId: old.requestId, detail: plugin() })
  await flushMicrotasks(6)
  expect(store.updateTarget.value).toBeUndefined()
  expect(channel.sent.some(item => item.event === 'histoire:ui:marketplace-plan')).toBe(false)
  await ready()
  expect(request('update-detail').requestId).not.toBe(old.requestId)
  expect(wrapper.text()).toContain('Update Accessibility')
  expect(button('Update').attributes('disabled')).toBeUndefined()
})

it('offers explicit continue and closes only after successful load', async () => {
  const { ready, button, channel, request, store, wrapper } = setup()
  store.prefs.value.afterInstall = 'ask'
  await ready()
  await button('Update').trigger('click')
  const running = job({ kind: 'update', awaiting: 'continue' })
  channel.emit('histoire:ui:marketplace-job-state', { requestId: request('job-start').requestId, job: running })
  await flushMicrotasks(6)
  expect(wrapper.get('[aria-live="polite"]').text()).toBe('Restart required')
  await button('Restart now').trigger('click')
  await flushMicrotasks(6)
  expect(request('job-continue')).toEqual({ jobId: 'job-1' })
  expect(store.updateTarget.value).toBe('@histoire/plugin-a11y')
  channel.emit('histoire:ui:marketplace-job-state', { job: job({ kind: 'update', status: 'succeeded', steps: running.steps.map(step => ({ ...step, state: 'done' })) }) })
  await flushMicrotasks(6)
  expect(store.updateTarget.value).toBeUndefined()
  expect((wrapper.get('dialog').element as HTMLDialogElement).open).toBe(false)
})

it('asks for a manual dev server restart when the server has no restart host', async () => {
  const { ready, button, channel, request, wrapper } = setup()
  const fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  await ready()
  await button('Update').trigger('click')
  channel.emit('histoire:ui:marketplace-job-state', { requestId: request('job-start').requestId, job: job({ kind: 'update', awaiting: 'restart' }) })
  await flushMicrotasks(6)
  expect(wrapper.get('[aria-live="polite"]').text()).toBe('Restart the dev server to finish')
  expect(wrapper.findAll('button').some(item => item.text() === 'Restart now')).toBe(false)
  expect(fetcher).not.toHaveBeenCalled()
})

it('routes unsafe migrations to manual instructions without admitting a job', async () => {
  const { ready, channel, button, store } = setup()
  const manual = { ...plan('manual'), command: undefined, files: [], manual: { reason: 'migration-manual' as const, steps: [{ title: 'Rename token to accessToken' }] } }
  await ready(manual)
  await button('Manual update').trigger('click')
  expect(store.updateTarget.value).toBeUndefined()
  expect(store.view.value).toBe('manual')
  expect(store.manualPlan.value).toEqual(manual)
  expect(channel.sent.some(item => item.event === 'histoire:ui:marketplace-job-start')).toBe(false)
})

it('keeps a later plugin visit intact when background admission completes', async () => {
  const { ready, channel, request, button, store, wrapper } = setup()
  await ready()
  await button('Update').trigger('click')
  const admission = request('job-start')
  await button('Run in background').trigger('click')
  store.openUpdate('@histoire/plugin-designs')
  await nextTick()
  const detail = plugin()
  detail.id = '@histoire/plugin-designs'
  detail.displayName = 'Designs'
  detail.installed = { version: '0.2.0', enabled: true, required: false, update: '1.0.0' }
  channel.emit('histoire:ui:marketplace-update-detail-result', { requestId: request('update-detail').requestId, detail })
  await flushMicrotasks(6)
  channel.emit('histoire:ui:marketplace-job-state', { requestId: admission.requestId, job: job({ kind: 'update' }) })
  await flushMicrotasks(6)
  expect(store.updateTarget.value).toBe('@histoire/plugin-designs')
  expect(wrapper.text()).toContain('Update Designs')
  expect(wrapper.find('[aria-live="polite"]').exists()).toBe(false)
  expect(store.postInstall.value?.pluginId).toBe('@histoire/plugin-a11y')
  expect(channel.sent.some(item => item.event === 'histoire:ui:marketplace-job-cancel')).toBe(false)
})
