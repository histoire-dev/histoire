import type { PluginDetail } from '@histoire/shared'
import type { Context } from '../../context.js'
import { afterEach, expect, it, onTestFinished, vi } from 'vitest'
import { marketplaceDefaults } from '../../../../../histoire-app/src/app/util/marketplace-preferences.js'
import { disposeConfigProjects } from '../utils/config-codemod.js'
import { registryServer } from '../utils/marketplace/registry-server.js'
import { inventoryPackage, inventoryProject } from './inventory-fixture.js'

/** Consent-off scenario must keep all release consumers offline. */
const prefs = { ...marketplaceDefaults(), afterInstall: 'ask' as const }
/** Existing bundled identity remains authoritative while test supplies version data. */
const id = '@histoire/plugin-a11y'
/** Version-scoped data accepted by the bundled history format. */
type History = Array<{
  /** Exact release. */ version: string
  /** Requirements declared by this release. */ requires: Record<string, string>
  /** Supported frameworks. */ frameworks: string[]
  /** Version-specific notes. */ releaseNotes?: PluginDetail['releaseNotes']
  /** Version-specific migrations. */ migrations?: PluginDetail['manifest']['migrations']
}>

/** Supply three real data records to the production reader; no module or algorithm is mocked. */
async function bundledHistory(prerelease = false) {
  vi.resetModules()
  const { default: index } = await import('../../marketplace/catalog/official.json', { with: { type: 'json' } })
  const entry: { /** Generator-only data. */ history?: History } = index.find(entry => entry.id === id)!
  const before = entry.history
  entry.history = [
    { version: '3.0.0', requires: { vite: '^7' }, frameworks: [], releaseNotes: [{ kind: 'breaking', text: 'Third release' }], migrations: [{ from: '<3', ops: [{ op: 'rename-option', from: 'middle', to: 'final' }] }] },
    { version: '2.0.0', requires: { vite: '^6 || ^7' }, frameworks: [], releaseNotes: [{ kind: 'feature', text: 'Second release' }], migrations: [{ from: '<2', ops: [{ op: 'rename-option', from: 'old', to: 'middle' }] }] },
    { version: '1.0.0', requires: { vite: '^6' }, frameworks: [] },
  ]
  if (prerelease) entry.history.unshift({ version: '4.0.0-beta.1', requires: { vite: '^6' }, frameworks: [] })
  onTestFinished(() => {
    if (before === undefined) delete entry.history
    else entry.history = before
  })
  // Bundled projections are built at module load, after declarative fixture input exists.
  const [official, catalog, updates, failure, details, releases, virtual] = await Promise.all([
    import('../../marketplace/catalog/official.js'),
    import('../../marketplace/catalog/service.js'),
    import('../../marketplace/inventory/registry-versions.js'),
    import('../../marketplace/jobs/failure.js'),
    import('../../marketplace/migrations/details.js'),
    import('../../marketplace/migrations/releases.js'),
    import('../../virtual/resolved-marketplace-official.js'),
  ])
  return { ...official, ...catalog, ...updates, ...failure, ...details, ...releases, ...virtual }
}

afterEach(async () => {
  vi.unstubAllEnvs()
  await disposeConfigProjects()
})

// Boundary: bundled JSON data, real update selection and migration aggregation, local registry observer.
// Defect: reusing latest metadata loses skipped notes/migrations or marks incompatible versions usable.
it('reads all bundled releases and combines skipped notes and ordered migrations without registry requests', async () => {
  const { readReleases, createRegistryUpdateReader, updateDetails } = await bundledHistory()
  const registry = await registryServer()
  onTestFinished(registry.close)
  vi.stubEnv('npm_config_registry', registry.url)
  const { root } = await inventoryProject(undefined, { vite: '^7' })
  await inventoryPackage(root, 'vite', '7.2.0')
  await inventoryPackage(root, id, '1.0.0')
  const releases = await readReleases(root, id, prefs)
  expect(releases.map(release => ({ version: release.latest, requires: release.requires, notes: release.releaseNotes, migrations: release.manifest.migrations }))).toEqual([
    { version: '3.0.0', requires: { vite: '^7' }, notes: [{ kind: 'breaking', text: 'Third release' }], migrations: [{ from: '<3', ops: [{ op: 'rename-option', from: 'middle', to: 'final' }] }] },
    { version: '2.0.0', requires: { vite: '^6 || ^7' }, notes: [{ kind: 'feature', text: 'Second release' }], migrations: [{ from: '<2', ops: [{ op: 'rename-option', from: 'old', to: 'middle' }] }] },
    { version: '1.0.0', requires: { vite: '^6' }, notes: undefined, migrations: undefined },
  ])
  const reader = createRegistryUpdateReader({ root } as Context, { registryUrl: registry.url })
  expect(await reader(id, prefs)).toEqual([
    { version: '3.0.0', compatible: true, releaseNotes: [{ kind: 'breaking', text: 'Third release' }] },
    { version: '2.0.0', compatible: true, releaseNotes: [{ kind: 'feature', text: 'Second release' }] },
    { version: '1.0.0', compatible: false, releaseNotes: undefined },
  ])
  const detail = await updateDetails({ root } as Context, id, prefs)
  expect(detail.latest).toBe('3.0.0')
  expect(detail.releaseNotes).toEqual([{ kind: 'breaking', text: 'Third release' }, { kind: 'feature', text: 'Second release' }])
  expect(detail.manifest.migrations).toEqual([{ from: '*', ops: [{ op: 'rename-option', from: 'old', to: 'middle' }, { op: 'rename-option', from: 'middle', to: 'final' }] }])
  expect(await readReleases(root, 'community-plugin', prefs)).toEqual([])
  expect(registry.requests).toEqual([])
})

it('suggests newest stable official release accepting the found peer without contacting registry', async () => {
  const { suggestVersion } = await bundledHistory(true)
  const registry = await registryServer()
  onTestFinished(registry.close)
  const { root } = await inventoryProject()
  expect(await suggestVersion(root, id, { code: 'peer-conflict', message: 'Conflict', peer: 'vite', found: '6.1.0' }, { registryUrl: registry.url })).toEqual({ version: '2.0.0', reason: 'Last version that supports vite 6' })
  expect(await suggestVersion(root, id, { code: 'peer-conflict', message: 'Conflict', peer: 'vite', found: '8.1.0' }, { registryUrl: registry.url })).toBeUndefined()
  expect(registry.requests).toEqual([])
})

it('keeps history private and returns independent version metadata', async () => {
  const { officialReleases, officialPlugins, resolvedMarketplaceOfficial } = await bundledHistory()
  const releases = officialReleases(id)
  releases[0].requires.vite = '*'
  expect(officialReleases(id)[0].requires.vite).toBe('^7')
  expect(officialReleases('community-plugin')).toEqual([])
  // Exercise the virtual-module boundary even if a future Node consumer attaches history to a DTO.
  const current = officialPlugins.find(entry => entry.id === id)! as PluginDetail & { /** Private metadata must stay server-side. */ history?: History }
  current.history = [{ version: '1.0.0', requires: {}, frameworks: [] }]
  onTestFinished(() => {
    delete current.history
  })
  const source = resolvedMarketplaceOfficial()
  const module = await import(`data:text/javascript,${encodeURIComponent(source)}`)
  expect(module.officialPlugins.find(entry => entry.id === id).versions).toBeDefined()
  expect(module.officialPlugins.every(entry => !Object.hasOwn(entry, 'history'))).toBe(true)
})

// Boundary: real catalog service detail over bundled history and installed project signals.
// Defect: official Versions rows keep generated placeholders instead of per-version verdicts.
it('evaluates each bundled official version against its own requirements in plugin details', async () => {
  const { createCatalogService } = await bundledHistory()
  const { root } = await inventoryProject(undefined, { vite: '^7' })
  await inventoryPackage(root, 'vite', '7.2.0')
  const detail = await createCatalogService({ root }).detail(id, prefs)
  expect(detail.versions.map(({ version, compatible }) => ({ version, compatible }))).toEqual([
    { version: '3.0.0', compatible: true },
    { version: '2.0.0', compatible: true },
    { version: '1.0.0', compatible: false },
  ])
  expect(detail.versions[2].reason).toBeTruthy()
})
