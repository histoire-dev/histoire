import type { ChangeRequest, MarketplacePrefs, PluginDetail } from '@histoire/shared'
import { webcrypto } from 'node:crypto'
import { expect, it, onTestFinished, vi } from 'vitest'
import { manualInstructions } from '../../../../../histoire-app/src/app/components/marketplace/install/manual-instructions.js'
import { createMarketplaceClient } from '../../../../../histoire-app/src/app/util/marketplace-client.js'
import { marketplaceDefaults } from '../../../../../histoire-app/src/app/util/marketplace-preferences.js'
import official from '../../marketplace/catalog/official.json'
import { manualPlan } from '../../marketplace/changes/manual.js'
import { createMarketplaceTransport } from '../utils/marketplace/transport.js'

/** Browser preferences used by both offline and channel requests. */
const prefs: MarketplacePrefs = marketplaceDefaults()

// Boundary: real static client and manual instructions, declarative catalog input,
// external channel fixture. Independent ordering/ranges reject substring-only search.
it('ranks offline tokens across fields, highlights original offsets and counts agnostic facets', async () => {
  const channel = createMarketplaceTransport()
  const entries: PluginDetail[] = [
    { ...official[0] as PluginDetail, id: 'z-audit', displayName: 'Auditor', summary: 'Vue support', frameworks: [], adds: [] },
    { ...official[0] as PluginDetail, id: 'b-vue', displayName: 'İVue', summary: 'Audit support', frameworks: ['vue'], adds: [] },
    { ...official[0] as PluginDetail, id: 'a-vue', displayName: 'İVue', summary: 'Audit support', frameworks: ['vue'], adds: [] },
    { ...official[0] as PluginDetail, id: 'other', displayName: 'Vue', summary: 'No matching second token', frameworks: ['vue'], adds: [] },
  ]
  const before = structuredClone(entries)
  const client = createMarketplaceClient({ transport: { ...channel.transport, available: () => false }, loadOfficial: async () => entries })
  const page = await client.catalog({ view: 'all', prefs, query: 'vue audit', filters: { frameworks: ['vue'] } })
  expect(page.entries.map(entry => entry.id)).toEqual(['z-audit', 'a-vue', 'b-vue'])
  expect(page.entries[1].match).toContainEqual({ field: 'displayName', ranges: [[1, 3]] })
  expect(page.entries[1].match).toContainEqual({ field: 'summary', ranges: [[0, 4]] })
  expect(page.facets.frameworks.vue).toBe(3)
  expect(entries).toEqual(before)
  expect(channel.sent).toEqual([])
})

it('uses server page size and deterministic id ties for offline name and updated sorts', async () => {
  const channel = createMarketplaceTransport()
  const entries = Array.from({ length: 32 }, (_, index) => ({ ...official[0] as PluginDetail, id: `plugin-${String(31 - index).padStart(2, '0')}`, displayName: 'Same', updatedAt: '2026-01-01' }))
  const client = createMarketplaceClient({ transport: { ...channel.transport, available: () => false }, loadOfficial: async () => entries })
  for (const sort of ['name', 'updated'] as const) {
    const page = await client.catalog({ view: 'all', prefs, sort })
    expect(page.entries.map(entry => entry.id)).toEqual(Array.from({ length: 30 }, (_, index) => `plugin-${String(index).padStart(2, '0')}`))
    expect(page.cursor).toBe('30')
    expect((await client.catalog({ view: 'all', prefs, sort, cursor: page.cursor })).entries.map(entry => entry.id)).toEqual(['plugin-30', 'plugin-31'])
  }
})

it.each(['yarn', 'bun'] as const)('pins exact versions with %s in static and alternative commands', async (name) => {
  const channel = createMarketplaceTransport()
  const detail = official[0] as PluginDetail
  const client = createMarketplaceClient({ transport: { ...channel.transport, available: () => false }, loadOfficial: async () => [detail] })
  const request: ChangeRequest = { kind: 'pin', id: detail.id, version: '1.2.3', prefs: { ...prefs, packageManager: name } }
  const reviewed = await client.plan(request)
  expect(reviewed.manual?.steps[0].code).toBe(`${name} add ${name === 'bun' ? '-d' : '-D'} -E ${detail.id}@1.2.3`)
  const instructions = await manualInstructions(request, detail, reviewed)
  expect(instructions.manual?.steps.slice(0, 4).map(step => step.code)).toEqual([
    `pnpm add -D --save-exact ${detail.id}@1.2.3`,
    `npm install -D --save-exact ${detail.id}@1.2.3`,
    `yarn add -D -E ${detail.id}@1.2.3`,
    `bun add -d -E ${detail.id}@1.2.3`,
  ])
})

it('correlates marketplace replies on HTTP hosts without crypto.randomUUID', async () => {
  vi.stubGlobal('crypto', { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) })
  onTestFinished(() => {
    vi.unstubAllGlobals()
  })
  const channel = createMarketplaceTransport()
  const client = createMarketplaceClient({ transport: channel.transport })
  const pending = client.updates(prefs)
  expect(channel.sent[0]?.value.requestId).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/)
  channel.emit('histoire:ui:marketplace-updates-result', { requestId: channel.sent[0].value.requestId, updates: [{ id: 'plugin', from: '1.0.0', to: '2.0.0', breaking: false }] })
  await expect(pending).resolves.toEqual([{ id: 'plugin', from: '1.0.0', to: '2.0.0', breaking: false }])
  expect(channel.listenerCount()).toBe(0)
})

it('nests declared static options, omits defaults and rejects prototype paths', async () => {
  const channel = createMarketplaceTransport()
  const detail = structuredClone(official[0]) as PluginDetail
  detail.manifest.config.options = [
    { key: 'test.minimumImpact', label: 'Impact', type: 'string', default: 'minor' },
    { key: 'test.enabled', label: 'Tests', type: 'boolean', default: false },
    { key: 'exclude', label: 'Excluded selectors', type: 'string-list', default: [] },
  ]
  const client = createMarketplaceClient({ transport: { ...channel.transport, available: () => false }, loadOfficial: async () => [detail] })
  const options = { 'test.minimumImpact': 'serious', 'test.enabled': false, 'exclude': ['.skip'] }
  const plan = await client.plan({ kind: 'options', id: detail.id, prefs, options })
  const snippet = plan.manual!.steps[0].code!
  const value = JSON.parse(snippet.slice(snippet.lastIndexOf(`${detail.manifest.config.import}(`) + detail.manifest.config.import.length + 1, -1))
  expect(value).toEqual({ test: { minimumImpact: 'serious' }, exclude: ['.skip'] })
  expect(options).toEqual({ 'test.minimumImpact': 'serious', 'test.enabled': false, 'exclude': ['.skip'] })
  for (const key of ['__proto__.polluted', 'constructor.prototype.polluted', 'test.__proto__']) {
    await expect(client.plan({ kind: 'options', id: detail.id, prefs, options: { [key]: 'unsafe' } })).rejects.toThrow('Invalid option path')
  }
})

it('preserves server manual snippets and reviewed workspace commands without duplicates', async () => {
  const channel = createMarketplaceTransport()
  const detail = official[0] as PluginDetail
  const request: ChangeRequest = { kind: 'install', id: detail.id, version: '1.2.3', prefs }
  const client = createMarketplaceClient({ transport: { ...channel.transport, available: () => false }, loadOfficial: async () => [detail] })
  const reviewed = await client.plan(request)
  reviewed.manual = manualPlan('config-not-literal', request, detail.manifest)
  const before = structuredClone(reviewed)
  expect(await manualInstructions(request, detail, reviewed)).toEqual(before)
  reviewed.manual = undefined
  reviewed.packageManager.name = 'pnpm'
  reviewed.command = { argv: ['pnpm', 'add', '-D', '-w', `${detail.id}@1.2.3`], display: `pnpm add -D -w ${detail.id}@1.2.3` }
  const fallback = await manualInstructions(request, detail, reviewed)
  expect(fallback.manual!.steps.slice(0, 4).map(step => step.code)).toEqual([
    `pnpm add -D -w ${detail.id}@1.2.3`,
    `npm install -D ${detail.id}@1.2.3`,
    `yarn add -D ${detail.id}@1.2.3`,
    `bun add -d ${detail.id}@1.2.3`,
  ])
  expect(fallback.manual!.steps.slice(4).map(step => step.title)).toEqual(['Update histoire.config.ts', 'Restart Histoire'])
  expect(fallback.manual!.steps[4].code).toContain(`${detail.manifest.config.import}()`)
})
