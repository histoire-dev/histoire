import type { CatalogQuery, MarketplaceManifest, MarketplacePrefs } from '@histoire/shared'
import { writeFile } from 'node:fs/promises'
import { join } from 'pathe'
import { afterEach, describe, expect, it, onTestFinished } from 'vitest'
import { marketplaceDefaults } from '../../../../../histoire-app/src/app/util/marketplace-preferences.js'
import { officialPlugins } from '../../marketplace/catalog/official.js'
import { createCatalogService } from '../../marketplace/catalog/service.js'
import { configTestProject, disposeConfigProjects } from '../utils/config-codemod.js'
import { packument, registryServer } from '../utils/marketplace/registry-server.js'
import { inventoryPackage } from './inventory-fixture.js'

/** Portable preferences used by real service calls. */
const prefs: MarketplacePrefs = { ...marketplaceDefaults(), community: true, afterInstall: 'ask' as const }
/** A valid independently named community package manifest. */
const manifest: MarketplaceManifest = { displayName: 'Second page audit', summary: 'Audit Vue stories', category: 'testing', monogram: 'Au', tint: 'blue', config: { import: 'Audit' }, frameworks: ['vue'], adds: [{ kind: 'story-tests', text: 'Audit checks' }], recommend: [{ dependency: 'vitest', reason: 'Vitest detected' }], collections: ['visual-testing'] }

/** Real scratch package installation used for dependency signal detection. */
async function project() {
  const { root } = await configTestProject()
  await writeFile(join(root, 'package.json'), JSON.stringify({ devDependencies: { vue: '^3', vite: '^7', vitest: '^4' } }))
  for (const [name, version] of Object.entries({ vue: '3.5.0', vite: '7.2.0', vitest: '4.0.0' })) {
    await inventoryPackage(root, name, version)
  }
  return root
}

/** Start external boundary and bind service to an isolated real project. */
async function setup(options: Parameters<typeof registryServer>[0] = {}) {
  const registry = await registryServer(options)
  onTestFinished(registry.close)
  const root = await project()
  const service = createCatalogService({ root }, { registryUrl: registry.url, timeoutMs: 80 })
  return { registry, root, service }
}

afterEach(disposeConfigProjects)

describe('catalog service', () => {
  it('keeps bundled catalog and details offline without contacting community registry', async () => {
    const { service, registry } = await setup({ status: 503 })
    const page = await service.catalog({ view: 'all', prefs: { ...prefs, community: false } })
    expect(page.sources).toEqual({ official: 'ok', community: 'off' })
    expect(page.total).toBe(officialPlugins.length)
    const detail = await service.detail('@histoire/plugin-a11y', { ...prefs, community: false })
    expect(detail.manifest.config.import).toBe('HstA11y')
    const react = await service.detail('@histoire/plugin-react', { ...prefs, community: false })
    expect(react.compatible.ok).toBe(false)
    expect(react.versions.every(version => !version.compatible)).toBe(true)
    await expect(service.detail('community-audit', { ...prefs, community: false })).rejects.toThrow('Plugin not found')
    expect(registry.requests).toHaveLength(0)
  })

  it('finds matches beyond first registry page, validates manifests, and never trusts official claims', async () => {
    const options = { names: ['invalid-plugin', 'community-audit', '@histoire/plugin-a11y'], pageSize: 1, packages: {
      'invalid-plugin': packument('invalid-plugin', { ...manifest, config: { import: '' } }),
      'community-audit': packument('community-audit', { ...manifest, official: true } as MarketplaceManifest),
      '@histoire/plugin-a11y': packument('@histoire/plugin-a11y', { ...manifest, displayName: 'Spoof' }),
    } }
    const { root, registry } = await setup(options)
    // Pagination tests use the production deadline; timeout behavior has its own delayed case.
    const service = createCatalogService({ root }, { registryUrl: registry.url })
    const page = await service.catalog({ view: 'all', query: 'second', prefs, limit: 1 })
    expect(page.total).toBe(1)
    expect(page.entries[0]).toMatchObject({ id: 'community-audit', official: false, match: [{ field: 'displayName', ranges: [[0, 5]] }] })
    expect(registry.requests.filter(url => url.pathname === '/-/v1/search').map(url => url.searchParams.get('from'))).toEqual(['0', '1', '2'])
    expect(registry.requests[0].searchParams.get('text')).toBe('keywords:histoire-plugin')
    const detail = await service.detail('community-audit', prefs)
    expect(detail).toMatchObject({ provenance: true, latest: '2.0.0', compatible: { ok: true } })
    const official = await service.detail('@histoire/plugin-a11y', prefs)
    expect(official.displayName).toBe('Accessibility')
    expect((await service.catalog({ view: 'all', prefs })).entries.some(entry => entry.id === 'invalid-plugin')).toBe(false)
    expect(registry.requests).toHaveLength(6)
  })

  it('returns official results after timeout instead of failing entire catalog', async () => {
    const { service } = await setup({ delayMs: 300 })
    const page = await service.catalog({ view: 'all', prefs })
    expect(page.sources.community).toBe('error')
    expect(page.total).toBe(officialPlugins.length)
  })

  it('shares concurrent fetches, persists cache, and serves stale data after expiry and errors', async () => {
    const { root, registry } = await setup({ packages: { 'community-audit': packument('community-audit', manifest) } })
    let now = 1000
    const options = { registryUrl: registry.url, now: () => now }
    const service = createCatalogService({ root }, options)
    const query: CatalogQuery = { view: 'all', prefs, query: 'second' }
    const pages = await Promise.all([service.catalog(query), service.catalog(query)])
    expect(pages.map(page => page.total)).toEqual([1, 1])
    expect(registry.requests).toHaveLength(2)
    registry.options.status = 503
    const reloaded = createCatalogService({ root }, options)
    expect((await reloaded.catalog(query)).sources.community).toBe('ok')
    expect(registry.requests).toHaveLength(2)
    now += 3600001
    const stale = await reloaded.catalog(query)
    expect(stale.sources.community).toBe('stale')
    expect(stale.entries[0].id).toBe('community-audit')
  })

  it('reports installed dependency signals, contextual picks, collections and failing peer reason', async () => {
    const { service } = await setup({ packages: { 'community-audit': packument('community-audit', manifest), 'new-vite-audit': packument('new-vite-audit', { ...manifest, displayName: 'New Vite audit' }, { vite: '^8.0.0' }) } })
    const page = await service.catalog({ view: 'discover', prefs })
    expect(page.project).toEqual({ frameworks: ['vue'], signals: ['vitest', 'vite 7'] })
    expect([page.discover!.hero, ...page.discover!.picks]).toContainEqual(expect.objectContaining({ id: 'community-audit', reason: 'Vitest detected' }))
    expect(page.discover!.collections.find(collection => collection.id === 'visual-testing')!.entries.map(entry => entry.id)).toContain('community-audit')
    expect((await service.detail('new-vite-audit', prefs)).compatible).toEqual({ ok: false, reason: 'Needs vite ^8.0.0' })
  })

  it('checks both npm peers and manifest requirements instead of letting one override the other', async () => {
    const { service } = await setup({ packages: { 'conflicting-audit': packument('conflicting-audit', { ...manifest, requires: { vite: '^7.0.0' } }, { vite: '^8.0.0' }) } })
    expect((await service.detail('conflicting-audit', prefs)).compatible.ok).toBe(false)
  })

  it('checks each published version against its own peers and deprecation metadata', async () => {
    const pkg = packument('community-audit', manifest)
    pkg.versions['1.0.0'] = { ...pkg.versions['2.0.0'], version: '1.0.0', peerDependencies: { vite: '^8.0.0' } }
    const { service } = await setup({ packages: { 'community-audit': pkg } })
    const detail = await service.detail('community-audit', prefs)
    expect(detail.versions).toEqual([
      { version: '2.0.0', compatible: true, date: undefined, deprecated: false },
      { version: '1.0.0', compatible: false, reason: 'Needs vite ^8.0.0', date: undefined, deprecated: false },
    ])
  })

  it('joins generation inventory and suppresses missing-category picks after install', async () => {
    const { root, registry } = await setup({ packages: { 'community-audit': packument('community-audit', { ...manifest, recommend: [{ missing: true, reason: 'Add audits' }] }) } })
    const service = createCatalogService({ root, pluginInventory: [{ name: '@histoire/plugin-a11y', packageName: '@histoire/plugin-a11y', version: '1.0.0-beta.1', enabled: true, builtin: false, local: false, required: false, official: true, client: true, frame: false }] }, { registryUrl: registry.url })
    const page = await service.catalog({ view: 'discover', prefs })
    expect(page.entries.find(entry => entry.id === '@histoire/plugin-a11y')!.installed).toEqual({ version: '1.0.0-beta.1', enabled: true, required: false })
    expect([page.discover!.hero, ...page.discover!.picks].some(entry => entry?.id === 'community-audit')).toBe(false)
  })
})
