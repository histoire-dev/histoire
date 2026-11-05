import type { JobState, PluginDetail } from '../../../../histoire-shared/src/index.js'
import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { h } from 'vue'
import PluginToolbarItem from '../../../../histoire-app/src/app/components/canvas/toolbar/PluginToolbarItem.vue'
import InspectorTabs from '../../../../histoire-app/src/app/components/inspector/InspectorTabs.vue'
import MarketplaceInstall from '../../../../histoire-app/src/app/components/marketplace/install/MarketplaceInstall.vue'
import MarketplaceSpotlightHost from '../../../../histoire-app/src/app/components/marketplace/spotlight/MarketplaceSpotlightHost.vue'
import RailButton from '../../../../histoire-app/src/app/components/shell/RailButton.vue'
import { provideCanvas } from '../../../../histoire-app/src/app/composables/canvas-settings.js'
import { createCanvasStore } from '../../../../histoire-app/src/app/stores/canvas.js'
import { sourceFixture } from '../../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { flushMicrotasks } from '../../../../histoire/src/node/__tests__/utils/flush.js'
import { createTestWorkbenchHost, pluginEntry } from '../../../../histoire/src/node/__tests__/utils/workbench-extensions.js'
import { job } from '../marketplace-install/fixtures.js'
import { plugin } from '../utils/marketplace-official.js'
import { buttonByName, mountMarketplace } from '../utils/marketplace-transport.js'

/** Bundled manifest reused without a second catalog fixture. */
export const accessibility = plugin()
/** Release mounted books and their owned hosts in reverse acquisition order. */
export const cleanups: (() => unknown)[] = []
// Real host/store/SFC lifecycle; only socket, browser storage and geometry are substituted.
// Wrong npm/descriptor mapping or trusting receipt/manifest adds must miss these real anchors.
/** Inputs for the real spotlight workflow harness. */
interface SpotlightOptions {
  /** Exposed anchors. */ anchors?: string[]
  /** Real toolbar presentation. */ toolbar?: 'action' | 'popover' | 'custom'
  /** Reviewed destination. */ openPane?: string
  /** Mounted wizard integration. */ wizard?: boolean
  /** Extra same-plugin pane. */ secondPane?: boolean
  /** Extra pane availability. */ secondPaneAvailable?: boolean
  /** Explicit pane/tab command. */ primaryCommand?: string
  /** Command unavailable in current context. */ commandUnavailable?: boolean
  /** Manifest descriptions supplied by transport. */ adds?: PluginDetail['manifest']['adds']
}
/** Mount registered inspector, rail and toolbar surfaces alongside the spotlight. */
export async function setup(options: SpotlightOptions = {}) {
  const anchors = options.anchors ?? ['tab', 'pane']
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, sourceFixture().adapters)
  const actions: string[] = []
  const { workbench, targets } = createTestWorkbenchHost({ session, plugins: [pluginEntry({
    id: 'a11y',
    apiVersion: 1,
    setup(api) {
      api.inspector.addTab({ id: 'audit', label: 'A11y', icon: 'document', primaryCommand: options.primaryCommand, mount: () => {} })
      api.shell.addPane({ id: 'results', label: 'Audit results', icon: 'document', primaryCommand: options.primaryCommand, mount: () => {} })
      if (options.secondPane) api.shell.addPane({ id: 'history', label: 'Audit history', icon: 'document', available: () => options.secondPaneAvailable !== false, mount: () => {} })
      api.commands.add({ id: 'unrelated', label: 'Other action', icon: 'document', run: () => {
        actions.push('unrelated')
      } })
      api.commands.add({ id: 'run', label: 'Run audit', icon: 'document', available: () => !options.commandUnavailable, run: () => {
        actions.push('audit')
      } })
      const base = { id: 'run-tool', label: 'Audit', icon: 'document', group: 'plugins' as const }
      api.toolbar.addItem(options.toolbar === 'custom'
        ? { ...base, type: 'custom', mount: (container) => { container.textContent = 'Audit tool' } }
        : options.toolbar === 'popover'
          ? { ...base, type: 'popover', command: 'a11y:run', mount: () => {} }
          : { ...base, type: 'action', command: 'a11y:run', run: () => {} })
    },
  }), pluginEntry({ id: 'other', apiVersion: 1, setup(api) {
    api.shell.addPane({ id: 'results', label: 'Other results', icon: 'document', mount: () => {} })
  } })] })
  await workbench.host.ready
  const { channel, store, wrapper, dispose } = mountMarketplace({
    session,
    workbench,
    setup: store => store.connect(),
    // Canvas context must be provided from component setup, not fixture setup.
    provide: () => provideCanvas(createCanvasStore()),
    render: () => h('main', [
      h('button', { id: 'opener' }, 'Install finished'),
      anchors.includes('tab') ? h(InspectorTabs, { idPrefix: 'inspector', tabs: [{ value: 'a11y:audit', label: 'A11y' }], activeTab: 'a11y:audit' }) : null,
      anchors.includes('pane') ? h(RailButton, { 'label': 'Audit results', 'icon': 'document', 'data-shell-pane': 'a11y:results' }) : null,
      anchors.includes('toolbar') ? h(PluginToolbarItem, { item: workbench.host.contributions('toolbar.item')[0], workbench, revision: 0, open: null }) : null,
      options.secondPane ? h(RailButton, { 'data-shell-pane': 'a11y:history', 'label': 'Audit history', 'icon': 'document' }) : null,
      h(RailButton, { 'data-shell-pane': 'other:results', 'label': 'Other results', 'icon': 'document' }),
      options.wizard ? h(MarketplaceInstall) : null,
      h(MarketplaceSpotlightHost),
    ]),
  })
  cleanups.push(dispose)
  const opener = wrapper.get<HTMLButtonElement>('#opener').element
  opener.focus()
  /** Deliver server lifecycle with empty contribution evidence; browser registry is authoritative. */
  async function deliver(overrides: Partial<JobState> = {}) {
    channel.emit('histoire:ui:marketplace-job-state', { job: job({ status: 'succeeded', steps: [{ id: 'load', state: 'done' }], contributions: [], ...overrides }) })
    await flushMicrotasks(32)
    for (const request of channel.sent.filter(item => item.event === 'histoire:ui:marketplace-detail')) {
      channel.emit('histoire:ui:marketplace-detail-result', { requestId: request.value.requestId, detail: { ...structuredClone(accessibility), manifest: { ...structuredClone(accessibility.manifest), ...(options.adds ? { adds: options.adds } : {}) } } })
    }
    await flushMicrotasks(32)
  }
  /** Find actions by visible name, not implementation classes. */
  const button = (name: string) => buttonByName(wrapper, name)
  if (options.wizard) store.startInstall({ kind: 'install', id: '@histoire/plugin-a11y', prefs: store.prefs.value })
  if (options.openPane) {
    const admission = store.startJob('plan-1', 'hash-1', { kind: 'install', id: '@histoire/plugin-a11y', prefs: store.prefs.value }, options.openPane)
    const request = channel.sent.find(item => item.event === 'histoire:ui:marketplace-job-start')!
    channel.emit('histoire:ui:marketplace-job-state', { requestId: request.value.requestId, job: job() })
    await admission
  }
  return { wrapper, store, channel, targets, actions, opener, deliver, button }
}
