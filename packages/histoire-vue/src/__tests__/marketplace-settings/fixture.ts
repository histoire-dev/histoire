import type { ChangePlan, JobState } from '../../../../histoire-shared/src/index.js'
import { h } from 'vue'
import MarketplaceDetail from '../../../../histoire-app/src/app/components/marketplace/detail/MarketplaceDetail.vue'
import PluginsSection from '../../../../histoire-app/src/app/components/pages/settings/PluginsSection.vue'
import SettingsNav from '../../../../histoire-app/src/app/components/pages/settings/SettingsNav.vue'
import { flushMicrotasks } from '../../../../histoire/src/node/__tests__/utils/flush.js'
import { createTestWorkbenchHost } from '../../../../histoire/src/node/__tests__/utils/workbench-extensions.js'
import { buttonByName, lastRequest, mountMarketplace } from '../utils/marketplace-transport.js'
import { updates } from './data.js'

/** Real settings UI, marketplace store/client and extension registry; fake channel only. */
export async function settingsFixture(options: { /** Exercise static presentation without rebuilding. */ dev?: boolean, /** Mount actual detail target. */ detail?: boolean, /** Mount shared settings navigation. */ nav?: boolean } = {}) {
  const { workbench } = createTestWorkbenchHost()
  const { channel, store, wrapper, settings, storage, dispose } = mountMarketplace({
    dev: options.dev,
    workbench,
    render: store => [h(PluginsSection, { dev: options.dev }), options.nav && h(SettingsNav, { section: 'plugins', dev: options.dev ?? true }), options.detail && store.view.value === 'detail' && h(MarketplaceDetail)],
  })
  store.connect()
  await flushMicrotasks(10)
  /** Last outbound request at a named transport boundary. */
  const request = (event: string) => lastRequest(channel, event).value
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
  const button = (label: string) => buttonByName(wrapper, label)
  return { wrapper, store, settings, storage, channel, request, replyUpdates, replyPlan, job, button, dispose }
}
