import type { PluginDetail } from '../../../../histoire-shared/src/index.js'
import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { HistoireProvider } from '@histoire/vue'
import { mount } from '@vue/test-utils'
import { afterEach, expect, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import MarketplaceDetail from '../../../../histoire-app/src/app/components/marketplace/detail/MarketplaceDetail.vue'
import MarketplaceModal from '../../../../histoire-app/src/app/components/marketplace/shell/MarketplaceModal.vue'
import { createMarketplaceStore, provideMarketplaceStore } from '../../../../histoire-app/src/app/stores/marketplace.js'
import { createUiSettingsStore } from '../../../../histoire-app/src/app/stores/settings.js'
import { createMarketplaceClient } from '../../../../histoire-app/src/app/util/marketplace-client.js'
import { sourceFixture } from '../../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { flushMicrotasks } from '../../../../histoire/src/node/__tests__/utils/flush.js'
import { memoryStorage } from '../../../../histoire/src/node/__tests__/utils/settings-storage.js'
import { resizeObserverFixture } from '../fixtures/resize-observer.js'
import { officialPlugins } from '../utils/marketplace-official.js'
import { createMarketplaceTransport } from '../utils/marketplace-transport.js'

const cleanups: (() => unknown)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
  vi.unstubAllGlobals()
})

/** Reuse bundled manifest, with distinct releases and metadata for public assertions. */
export function plugin(): PluginDetail {
  const detail = structuredClone(officialPlugins.find(item => item.id === '@histoire/plugin-a11y')!) as PluginDetail
  return {
    ...detail,
    latest: '2.0.0',
    updatedAt: '2026-11-04T12:00:00Z',
    license: 'MIT',
    repoUrl: 'https://github.com/histoire-dev/a11y',
    frameworks: ['vue', 'react'],
    adds: [{ kind: 'rail-pane', text: 'Audit results' }, { kind: 'story-tests', text: 'Variant checks' }],
    requires: { histoire: '>=1.0.0', vue: '^3.5.0' },
    access: ['story-dom', 'network'],
    versions: [
      { version: '2.0.0', compatible: true, date: '2026-11-04' },
      { version: '1.5.0', compatible: true, deprecated: true },
      { version: '1.0.0', compatible: false, reason: 'Needs vite ^8.0.0' },
    ],
    releaseNotes: [{ kind: 'breaking', text: 'Rename audit rule', code: ['rules'] }, { kind: 'feature', text: 'Add keyboard checks' }, { kind: 'fix', text: 'Fix audit cleanup' }],
    manifest: { ...detail.manifest, config: { import: 'HstA11y', options: [
      { key: 'test', label: 'Run as story tests', type: 'boolean', default: false, description: 'One check per variant' },
      { key: 'rules', label: 'Rule set', type: 'enum', choices: [{ value: 'aa', label: 'WCAG AA' }], default: 'aa' },
      { key: 'skip', label: 'Skip selectors', type: 'string-list', default: [] },
    ] } },
  }
}

/** Real detail/store/client; only channel, persistence and missing resize API substituted. */
export function setup(modal = false) {
  resizeObserverFixture()
  const channel = createMarketplaceTransport()
  const storage = memoryStorage()
  const store = createMarketplaceStore({ client: createMarketplaceClient({ transport: channel.transport }), settings: createUiSettingsStore({ storage }), storage })
  const Host = defineComponent(() => {
    provideMarketplaceStore(store)
    return () => h(modal ? MarketplaceModal : MarketplaceDetail)
  })
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, sourceFixture().adapters)
  cleanups.push(() => session.dispose())
  const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => modal ? h(Host) : h('dialog', { open: true }, h(Host)) }, attachTo: document.body })
  cleanups.push(() => {
    wrapper.unmount()
    store.dispose()
  })
  // jsdom lacks native top-layer behavior; keep real modal/store wiring under test.
  const dialog = wrapper.get('dialog').element as HTMLDialogElement
  dialog.showModal = () => {
    dialog.open = true
  }
  dialog.close = () => {
    dialog.open = false
  }
  store.openMarketplace('all')
  store.showPlugin('@histoire/plugin-a11y')
  /** Read actual emitted request, including correlation ID. */
  function request() {
    return channel.sent.filter(item => item.event === 'histoire:ui:marketplace-detail').at(-1)!.value
  }
  /** Complete real client response and Vue rendering. */
  async function reply(detail = plugin()) {
    await nextTick()
    expect(request()).toMatchObject({ id: detail.id, prefs: { community: false } })
    channel.emit('histoire:ui:marketplace-detail-result', { requestId: request().requestId, detail })
    await flushMicrotasks(6)
  }
  /** Resolve button by its visible accessible name without presentation selectors. */
  function button(label: string) {
    const result = wrapper.findAll('button').find(item => item.text() === label)
    if (!result) throw new Error(`Missing button: ${label}`)
    return result
  }
  return { wrapper, store, channel, reply, request, button }
}
