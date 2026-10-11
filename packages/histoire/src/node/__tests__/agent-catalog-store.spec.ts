import type { UiAgentRegistry, UiAgentsSnapshot } from '@histoire/shared'
import { describe, expect, it } from 'vitest'
import { createAgentsStore } from '../../../../histoire-app/src/app/stores/agents.js'
import { agentCatalogRows } from '../../../../histoire-app/src/app/util/agent-catalog-rows.js'

/** Existing custom launch with legacy identity must survive remote discovery unchanged. */
const settings: UiAgentsSnapshot = { enabled: true, enabledIds: ['claude'], presets: [{ id: 'claude', name: 'My Claude', command: '/custom/claude', default: true, model: 'model-a', effort: 'deep' }], agents: [], permissions: { fileEdits: 'never', terminal: 'ask' }, context: { exposeMcp: true, attachScreenshot: true, includeSource: true, askEachTime: false } }
/** Catalog exceeds configured preset limit and includes canonical legacy identity. */
const registry: UiAgentRegistry = { status: { state: 'fresh' }, entries: [{ id: 'claude-acp', name: 'Claude', available: true, command: 'npx', args: ['--yes', 'claude@1'] }, ...Array.from({ length: 40 }, (_, index) => ({ id: `agent-${index}`, name: `Agent ${index}`, available: true, command: 'uvx', args: ['agent'] }))] }

/** Browser store executes real catalog/ownership logic with remote transport boundary. */
function storeWith(configOptions: NonNullable<Parameters<typeof createAgentsStore>[0]>['configOptions']) {
  const store = createAgentsStore({ send: () => true, snapshot: () => () => {}, permission: () => () => {}, resolved: () => () => {}, disconnect: () => () => {}, environment: async () => {}, registry: async () => registry, configOptions })
  store.state.value = structuredClone(settings)
  store.connected.value = true
  return store
}

describe('full catalog and scoped browser discovery', () => {
  it('deduplicates legacy IDs, preserves custom default and searches all entries without configuring them', async () => {
    const store = storeWith(async agentId => ({ agentId }))
    try {
      await store.loadRegistry()
      expect(agentCatalogRows(store.state.value, store.catalog.value.entries)).toHaveLength(41)
      expect(agentCatalogRows(store.state.value, store.catalog.value.entries)[0]).toMatchObject({ id: 'claude', name: 'My Claude' })
      expect(agentCatalogRows(store.state.value, store.catalog.value.entries, 'agent-39').map(row => row.id)).toEqual(['agent-39'])
      expect(store.state.value).toEqual(settings)
    }
    finally {
      store.close()
    }
  })

  it('drops held discovery after reconfiguration, disconnect and actual store teardown', async () => {
    let finish: (value: { agentId: string }) => void = () => {}
    const store = storeWith(() => new Promise((resolve) => {
      finish = resolve
    }))
    const probe = store.discoverAgent('claude')
    store.state.value = { ...store.state.value, enabledIds: [] }
    finish({ agentId: 'claude' })
    await probe
    expect(store.discoveries.value.claude.value).toBeUndefined()
    store.state.value = structuredClone(settings)
    const next = store.discoverAgent('claude', true)
    store.close()
    finish({ agentId: 'claude' })
    await next
    expect(store.discoveries.value).toEqual({})
  })
})
