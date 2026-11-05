import type { ChangePlan, JobState, PluginDetail } from '../../../../histoire-shared/src/index.js'
import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { HistoireProvider } from '@histoire/vue'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import MarketplaceInstall from '../../../../histoire-app/src/app/components/marketplace/install/MarketplaceInstall.vue'
import { provideExtensionHost } from '../../../../histoire-app/src/app/composables/extensions.js'
import { createMarketplaceStore, provideMarketplaceStore } from '../../../../histoire-app/src/app/stores/marketplace.js'
import { createUiSettingsStore } from '../../../../histoire-app/src/app/stores/settings.js'
import { createMarketplaceClient } from '../../../../histoire-app/src/app/util/marketplace-client.js'
import { sourceFixture } from '../../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { flushMicrotasks } from '../../../../histoire/src/node/__tests__/utils/flush.js'
import { memoryStorage } from '../../../../histoire/src/node/__tests__/utils/settings-storage.js'
import { createTestWorkbenchHost, pluginEntry } from '../../../../histoire/src/node/__tests__/utils/workbench-extensions.js'
import { resizeObserverFixture } from '../fixtures/resize-observer.js'
import { officialPlugins } from '../utils/marketplace-official.js'
import { createMarketplaceTransport } from '../utils/marketplace-transport.js'

/** Bundled metadata, extended only for conditional form coverage. */
export function plugin(): PluginDetail {
  const detail = structuredClone(officialPlugins.find(item => item.id === '@histoire/plugin-a11y')!) as PluginDetail
  detail.provenance = true
  detail.manifest.config.options = [
    { key: 'test', label: 'Run as story tests', type: 'boolean', default: false },
    { key: 'failOn', label: 'Fail tests on', type: 'enum', display: 'segmented', default: 'serious', choices: [{ value: 'serious', label: 'Serious' }, { value: 'critical', label: 'Critical' }], when: { test: true } },
    { key: 'rules', label: 'Rule set', type: 'enum', default: 'aa', choices: [{ value: 'aa', label: 'WCAG AA' }, { value: 'aaa', label: 'WCAG AAA' }] },
    { key: 'name', label: 'Report name', type: 'string', default: '' },
    { key: 'skip', label: 'Skip selectors', type: 'string-list', default: [] },
  ]
  return detail
}

/** Independent review data: exact bytes must reach Review and job admission. */
export function plan(suffix = '1'): ChangePlan {
  return {
    planId: `plan-${suffix}`,
    hash: `hash-${suffix}`,
    packageManager: { name: 'pnpm', source: 'lockfile' },
    command: { argv: ['pnpm', 'add', '-D', '@histoire/plugin-a11y@1.0.0'], display: 'pnpm add -D @histoire/plugin-a11y@1.0.0' },
    warnings: [],
    files: [
      { path: 'package.json', added: 1, removed: 0, lines: [{ kind: 'add', text: '"@histoire/plugin-a11y": "1.0.0"' }] },
      { path: 'histoire.config.ts', added: Number(suffix), removed: 0, lines: [{ kind: 'add', text: `HstA11y({ test: ${suffix === '2' ? 'true' : 'false'} })` }] },
    ],
  }
}

/** Server snapshot with ordered lifecycle and meaningful log/timing evidence. */
export function job(overrides: Partial<JobState> = {}): JobState {
  return { jobId: 'job-1', kind: 'install', id: '@histoire/plugin-a11y', version: '1.0.0', status: 'running', steps: [{ id: 'resolve', state: 'done', ms: 35 }, { id: 'install', state: 'running' }, { id: 'config', state: 'pending' }, { id: 'restart', state: 'pending' }, { id: 'load', state: 'pending' }], output: ['Resolving dependencies', 'Packages: +1'], ...overrides }
}

/** Real wizard/store/client; substitute external transport and Map-backed storage. */
export function setup(cleanups: (() => unknown)[], offline = false, withPane = false) {
  resizeObserverFixture()
  const channel = createMarketplaceTransport()
  if (offline) channel.transport.available = () => false
  const storage = memoryStorage()
  const store = createMarketplaceStore({ client: createMarketplaceClient({ transport: channel.transport }), settings: createUiSettingsStore({ storage }), storage })
  store.openMarketplace('all')
  store.startInstall({ id: '@histoire/plugin-a11y', kind: 'install', version: '1.0.0', prefs: store.prefs.value })
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, sourceFixture().adapters)
  const { workbench, targets } = createTestWorkbenchHost({ session, plugins: withPane
    ? [pluginEntry({
        id: 'a11y',
        apiVersion: 1,
        setup(api) {
          api.shell.addPane({ id: 'results', label: 'Audit results', icon: 'document', mount: () => {} })
        },
      })]
    : [] })
  const Host = defineComponent(() => {
    provideMarketplaceStore(store)
    provideExtensionHost(workbench)
    store.connect()
    return () => h(MarketplaceInstall)
  })
  const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(Host) }, attachTo: document.body })
  cleanups.push(async () => {
    wrapper.unmount()
    store.dispose()
    await workbench.dispose()
    await session.dispose()
  })
  /** Last outbound request of one exact event. */
  function request(event = 'plan') {
    const found = channel.sent.filter(item => item.event === `histoire:ui:marketplace-${event}`).at(-1)
    if (!found) throw new Error(`Missing request: ${event}`)
    return found.value
  }
  /** Resolve detail followed by initial plan. */
  async function ready() {
    await nextTick()
    channel.emit('histoire:ui:marketplace-detail-result', { requestId: request('detail').requestId, detail: plugin() })
    await flushMicrotasks(6)
    channel.emit('histoire:ui:marketplace-plan-result', { requestId: request().requestId, plan: plan() })
    await flushMicrotasks(6)
  }
  /** Visible action, independent of component or styling. */
  function button(name: string) {
    const found = wrapper.findAll('button').find(item => item.text().trim() === name || item.attributes('aria-label') === name)
    if (!found) throw new Error(`Missing button: ${name}`)
    return found
  }
  /** Complete successful start; later states use the real store subscription. */
  async function start() {
    await button('Continue').trigger('click')
    await button('Install').trigger('click')
    channel.emit('histoire:ui:marketplace-job-state', { requestId: request('job-start').requestId, job: job() })
    await flushMicrotasks(6)
  }
  return { channel, store, storage, wrapper, request, ready, button, start, targets }
}
