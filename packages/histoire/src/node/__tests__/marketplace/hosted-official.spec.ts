import type { Context } from '../../context.js'
import { writeFile } from 'node:fs/promises'
import { join } from 'pathe'
import { afterEach, expect, it, onTestFinished } from 'vitest'
import { marketplaceDefaults } from '../../../../../histoire-app/src/app/util/marketplace-preferences.js'
import { clearRegistryMemory } from '../../marketplace/catalog/cache.js'
import { getCatalogService } from '../../marketplace/catalog/service.js'
import { getPlanStore } from '../../marketplace/changes/handlers.js'
import { createRegistryUpdateReader } from '../../marketplace/inventory/registry-versions.js'
import { createUpdateService } from '../../marketplace/inventory/updates.js'
import { updateDetails } from '../../marketplace/migrations/details.js'
import { disposeConfigProjects } from '../utils/config-codemod.js'
import { packument, registryServer } from '../utils/marketplace/registry-server.js'
import { inventoryPackage, inventoryProject } from './inventory-fixture.js'
import { jobManifest } from './jobs-fixture.js'

const prefs = { ...marketplaceDefaults(), packageManager: 'pnpm' as const }
const id = '@histoire/plugin-test-feed'
const query = { view: 'all' as const, prefs }
afterEach(disposeConfigProjects)

/** Publish two snapshots to one server while keeping the project and client live. */
it('refreshes listings, exact-version install metadata and installed updates independently of Histoire', async () => {
  const old = packument(id, { ...jobManifest, displayName: 'Feed plugin', config: { import: 'TestPlugin' } }, {}, '1.0.0')
  const { root, file } = await inventoryProject(`import { TestPlugin } from '${id}'\nexport default { plugins: [TestPlugin({ old: true })] }\n`, { [id]: '1.0.0' })
  await inventoryPackage(root, id, '1.0.0')
  const feed = await registryServer({ body: JSON.stringify({ schemaVersion: 1, packages: [{ packument: old }] }) })
  onTestFinished(feed.close)
  await writeFile(join(root, '.npmrc'), `registry=${feed.url}/\n//${new URL(feed.url).host}/:_authToken=fixture-token\n`)
  let now = 300_000
  const ctx = { root, configFile: file, config: { plugins: [] }, mode: 'dev', pluginInventory: [{ packageName: id, version: '1.0.0', enabled: true, local: false, official: false }] } as Context
  const service = getCatalogService(ctx, { officialUrl: `${feed.url}/official.json`, now: () => now })
  const updates = createUpdateService(ctx, createRegistryUpdateReader(ctx), () => now)
  const [page, initial] = await Promise.all([service.catalog(query), updates.updates(prefs)])
  expect(page.entries.map(entry => [entry.id, entry.latest, entry.official])).toEqual([[id, '1.0.0', true]])
  expect(initial).toEqual([])
  expect(feed.requests.map(url => url.pathname)).toEqual(['/official.json'])

  const newId = '@histoire/plugin-test-addition'
  const addition = packument(newId, { ...jobManifest, displayName: 'New listing', config: { import: 'NewPlugin' } }, {}, '1.0.0')
  const next = packument(id, {
    ...jobManifest,
    displayName: 'Feed plugin',
    config: { import: 'TestPlugin', options: [{ key: 'renamed', type: 'boolean', label: 'Renamed' }] },
    releaseNotes: [{ kind: 'feature', text: 'Renamed the option' }],
    migrations: [{ from: '<1.1.0', ops: [{ op: 'rename-option', from: 'old', to: 'renamed' }] }],
  }, {}, '1.1.0')
  const incompatible = packument(id, { ...jobManifest, displayName: 'Feed plugin', config: { import: 'NextPlugin' } }, { histoire: '^90.0.0' }, '2.0.0')
  feed.options.body = JSON.stringify({ schemaVersion: 1, packages: [{ packument: { ...incompatible, versions: { ...next.versions, ...old.versions, ...incompatible.versions } } }, { packument: addition }] })
  now += 3_600_000
  expect(await updates.updates(prefs)).toEqual([{ id, from: '1.0.0', to: '1.1.0', breaking: false }])
  expect((await service.catalog(query)).entries.map(entry => entry.id).sort()).toEqual([newId, id])
  const detail = await service.detail(id, prefs, '1.1.0')
  expect(detail.versions.map(release => [release.version, release.compatible])).toEqual([['2.0.0', false], ['1.1.0', true], ['1.0.0', true]])
  expect(detail.manifest.config.options?.map(option => option.key)).toEqual(['renamed'])
  expect((await updateDetails(ctx, id, prefs)).releaseNotes).toEqual([{ kind: 'feature', text: 'Renamed the option' }])
  // Review metadata may be stale, but planning must never refresh it.
  now += 3_600_000
  const store = getPlanStore(ctx)
  const install = await store.plan({ id: newId, kind: 'install', version: '1.0.0', prefs })
  expect(install.command?.argv).toContain(`${newId}@1.0.0`)
  expect((await store.verifyPlan(install.planId, install.hash)).configCode).toContain(`import { NewPlugin } from '${newId}'`)
  const plan = await store.plan({ id, kind: 'update', version: '1.1.0', prefs, migrate: true })
  expect(plan.command?.argv).toContain(`${id}@1.1.0`)
  expect((await store.verifyPlan(plan.planId, plan.hash)).configCode).toContain('renamed: true')
  expect(feed.requests).toHaveLength(2)
  expect(feed.headers.every(headers => headers.authorization === undefined)).toBe(true)

  feed.options.body = JSON.stringify({ schemaVersion: 1, packages: [{ packument: old }, { packument: addition }] })
  await service.catalog(query)
  await expect(store.verifyPlan(plan.planId, plan.hash)).rejects.toMatchObject({ code: 'unavailable' })
})

it('keeps saved listings through invalid refreshes and uses bundled data for opt-out and static books', async () => {
  const listing = packument(id, { ...jobManifest, displayName: 'Feed listing' })
  const feed = await registryServer({ body: JSON.stringify({ schemaVersion: 1, packages: [{ packument: listing }] }) })
  onTestFinished(feed.close)
  const { root } = await inventoryProject()
  let now = 300_000
  const options = { officialUrl: `${feed.url}/official.json`, now: () => now }
  const bundled = await getCatalogService({ root }).catalog(query)
  expect(bundled.entries.length).toBeGreaterThan(0)
  for (const ctx of [{ root, mode: 'build' as const }, { root, mode: 'dev' as const, config: { plugins: [], marketplace: { refreshOfficialCatalog: false } } }]) {
    const page = await getCatalogService(ctx, options).catalog(query)
    expect(page.entries).toEqual(bundled.entries)
  }
  expect(feed.requests).toHaveLength(0)

  const live = getCatalogService({ root, mode: 'dev' }, options)
  expect((await live.catalog(query)).entries.map(entry => entry.id)).toEqual([id])
  now += 3_600_000
  feed.options.body = JSON.stringify({ schemaVersion: 1, packages: [{ packument: { ...listing, name: 'community-spoof' } }] })
  for (let i = 0; i < 2; i++) {
    const page = await live.catalog(query)
    expect(page.sources.official).toBe('stale')
    expect(page.entries.map(entry => entry.id)).toEqual([id])
  }
  expect(feed.requests).toHaveLength(2)
  clearRegistryMemory(root)
  const reopened = await getCatalogService({ root, mode: 'dev' }, options).catalog(query)
  expect(reopened.sources.official).toBe('stale')
  expect(reopened.entries.map(entry => entry.id)).toEqual([id])
  const clean = await inventoryProject()
  const fallback = await getCatalogService({ root: clean.root, mode: 'dev' }, options).catalog(query)
  expect(fallback.sources.official).toBe('fallback')
  expect(fallback.entries).toEqual(bundled.entries)
})

it('uses bundled listings after a timed-out fetch and recovers on a later visit', async () => {
  const listing = packument(id, { ...jobManifest, displayName: 'Feed listing' })
  const feed = await registryServer({ delayMs: 1000, body: JSON.stringify({ schemaVersion: 1, packages: [{ packument: listing }] }) })
  onTestFinished(feed.close)
  const { root } = await inventoryProject()
  let now = 300_000
  const service = getCatalogService({ root, mode: 'dev' }, { officialUrl: `${feed.url}/official.json`, officialTimeoutMs: 200, now: () => now })
  expect((await service.catalog(query)).sources.official).toBe('fallback')
  expect(feed.requests).toHaveLength(1)

  feed.options.delayMs = 0
  now += 300_000
  const recovered = await service.catalog(query)
  expect(recovered.sources.official).toBe('ok')
  expect(recovered.entries.map(entry => entry.id)).toEqual([id])
  expect(feed.requests).toHaveLength(2)
})
