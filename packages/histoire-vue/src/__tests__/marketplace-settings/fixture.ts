import type { ChangePlan, JobState } from '../../../../histoire-shared/src/index.js'
import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { HistoireProvider } from '@histoire/vue'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import MarketplaceDetail from '../../../../histoire-app/src/app/components/marketplace/detail/MarketplaceDetail.vue'
import PluginsSection from '../../../../histoire-app/src/app/components/pages/settings/PluginsSection.vue'
import SettingsNav from '../../../../histoire-app/src/app/components/pages/settings/SettingsNav.vue'
import { provideExtensionHost } from '../../../../histoire-app/src/app/composables/extensions.js'
import { createMarketplaceStore, provideMarketplaceStore } from '../../../../histoire-app/src/app/stores/marketplace.js'
import { createUiSettingsStore } from '../../../../histoire-app/src/app/stores/settings.js'
import { createMarketplaceClient } from '../../../../histoire-app/src/app/util/marketplace-client.js'
import { sourceFixture } from '../../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { flushMicrotasks } from '../../../../histoire/src/node/__tests__/utils/flush.js'
import { memoryStorage } from '../../../../histoire/src/node/__tests__/utils/settings-storage.js'
import { createTestWorkbenchHost } from '../../../../histoire/src/node/__tests__/utils/workbench-extensions.js'
import { resizeObserverFixture } from '../fixtures/resize-observer.js'
import { createMarketplaceTransport } from '../utils/marketplace-transport.js'
import { updates } from './data.js'

/** Real settings UI, marketplace store/client and extension registry; fake channel only. */
export async function settingsFixture(options: { /** Exercise static presentation without rebuilding. */ dev?: boolean, /** Mount actual detail target. */ detail?: boolean, /** Mount shared settings navigation. */ nav?: boolean } = {}) {
  resizeObserverFixture()
  const channel = createMarketplaceTransport()
  const storage = memoryStorage()
  const settings = createUiSettingsStore({ storage })
  const store = createMarketplaceStore({ client: createMarketplaceClient({ transport: channel.transport }), settings, storage })
  const { workbench } = createTestWorkbenchHost()
  const Host = defineComponent(() => {
    provideMarketplaceStore(store)
    provideExtensionHost(workbench)
    return () => [h(PluginsSection, { dev: options.dev }), options.nav && h(SettingsNav, { section: 'plugins', dev: options.dev ?? true }), options.detail && store.view.value === 'detail' && h(MarketplaceDetail)]
  })
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, sourceFixture().adapters)
  const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(Host) }, attachTo: document.body })
  store.connect()
  await flushMicrotasks(10)
  /** Last outbound request at a named transport boundary. */
  function request(event: string) {
    const result = channel.sent.filter(item => item.event === `histoire:ui:marketplace-${event}`).at(-1)
    if (!result) throw new Error(`Missing ${event} request`)
    return result.value
  }
  /** Supply correlated update inventory, then flush actual Vue rendering. */
  async function replyUpdates(value = updates): Promise<void> {
    channel.emit('histoire:ui:marketplace-updates-result', { requestId: request('updates').requestId, updates: value })
    await flushMicrotasks(10)
  }
  /** Respond with a reviewed executable plan at the server boundary. */
  async function replyPlan(manual = false): Promise<void> {
    const plan: ChangePlan = { planId: 'reviewed', hash: 'hash', files: [], warnings: [], packageManager: { name: 'pnpm', source: 'lockfile' }, ...(manual ? { manual: { reason: 'config-not-literal' as const, steps: [] } } : {}) }
    channel.emit('histoire:ui:marketplace-plan-result', { requestId: request('plan').requestId, plan })
    await flushMicrotasks(10)
  }
  /** Broadcast server-owned progress or settle an admission request. */
  async function job(value: Partial<JobState> = {}, admitted = true): Promise<void> {
    channel.emit('histoire:ui:marketplace-job-state', { ...(admitted ? { requestId: request('job-start').requestId } : {}), job: { jobId: 'first', id: '@histoire/plugin-a11y', kind: 'update', version: '1.1.1', status: 'running', steps: [{ id: 'install', state: 'running' }], output: [], ...value } })
    await flushMicrotasks(10)
  }
  /** Public accessible action lookup, independent of layout and classes. */
  function button(label: string) {
    const result = wrapper.findAll('button').find(item => item.text() === label || item.attributes('aria-label') === label)
    if (!result) throw new Error(`Missing button ${label}`)
    return result
  }
  /** Release requests and mounted ownership even after failed assertions. */
  async function dispose(): Promise<void> {
    wrapper.unmount()
    store.dispose()
    await workbench.dispose()
    await session.dispose()
  }
  return { wrapper, store, settings, storage, channel, request, replyUpdates, replyPlan, job, button, dispose }
}
