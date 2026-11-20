import type { PluginDetail } from '../../../../histoire-shared/src/index.js'
import { afterEach, expect, vi } from 'vitest'
import { h, nextTick } from 'vue'
import MarketplaceDetail from '../../../../histoire-app/src/app/components/marketplace/detail/MarketplaceDetail.vue'
import MarketplaceModal from '../../../../histoire-app/src/app/components/marketplace/shell/MarketplaceModal.vue'
import { flushMicrotasks } from '../../../../histoire/src/node/__tests__/utils/flush.js'
import { plugin as bundledPlugin } from '../utils/marketplace-official.js'
import { buttonByName, lastRequest, mountMarketplace } from '../utils/marketplace-transport.js'

const cleanups: (() => unknown)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
  vi.unstubAllGlobals()
})

/** Reuse bundled manifest, with distinct releases and metadata for public assertions. */
export function plugin(): PluginDetail {
  const detail = bundledPlugin()
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
  const { channel, store, wrapper, dispose } = mountMarketplace({
    render: () => modal ? h(MarketplaceModal) : h('dialog', { open: true }, h(MarketplaceDetail)),
  })
  cleanups.push(dispose)
  store.openMarketplace('all')
  store.showPlugin('@histoire/plugin-a11y')
  /** Read actual emitted request, including correlation ID. */
  function request() {
    return lastRequest(channel, 'detail').value
  }
  /** Complete real client response and Vue rendering. */
  async function reply(detail = plugin()) {
    await nextTick()
    await vi.waitFor(() => expect(request()).toMatchObject({ id: detail.id, prefs: { community: false } }), { timeout: 5000 })
    channel.emit('histoire:ui:marketplace-detail-result', { requestId: request().requestId, detail })
    await flushMicrotasks(6)
  }
  /** Resolve visible actions through the common accessible lookup. */
  const button = (label: string) => buttonByName(wrapper, label)
  return { wrapper, store, channel, reply, request, button }
}
