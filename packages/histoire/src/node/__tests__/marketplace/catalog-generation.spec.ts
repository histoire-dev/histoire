import type { MarketplacePrefs } from '@histoire/shared'
import type { Context } from '../../context.js'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'pathe'
import { afterEach, expect, it, onTestFinished } from 'vitest'
import { marketplaceDefaults } from '../../../../../histoire-app/src/app/util/marketplace-preferences.js'
import { clearRegistryMemory, REGISTRY_CACHE_PATH } from '../../marketplace/catalog/cache.js'
import { officialPlugins } from '../../marketplace/catalog/official.js'
import { getCatalogService } from '../../marketplace/catalog/service.js'
import { detectProjectSignals } from '../../marketplace/catalog/signals.js'
import { updateDetails } from '../../marketplace/migrations/details.js'
import { disposeConfigProjects } from '../utils/config-codemod.js'
import { registryServer } from '../utils/marketplace/registry-server.js'
import { inventoryPackage, inventoryProject } from './inventory-fixture.js'

/** Community consent applies to every real consumer in these scenarios. */
const prefs: MarketplacePrefs = { ...marketplaceDefaults(), community: true, afterInstall: 'ask' as const }

afterEach(disposeConfigProjects)

// Real service and update consumers share HTTP fixture only. A second client would
// issue duplicate held requests; root-only memoization would keep a new generation stale.
it('shares registry work between catalog details and update details within one context', async () => {
  const id = 'generation-plugin'
  const manifest = { ...officialPlugins[0].manifest, frameworks: [], requires: {} }
  const registry = await registryServer({ delayMs: 50, packages: { [id]: {
    'name': id,
    'dist-tags': { latest: '2.0.0' },
    'versions': Object.fromEntries(['1.0.0', '2.0.0'].map(version => [version, { name: id, version, histoire: { marketplace: manifest } }])),
  } } })
  onTestFinished(registry.close)
  const { root } = await inventoryProject()
  await inventoryPackage(root, id, '1.0.0')
  await writeFile(join(root, '.npmrc'), `registry=${registry.url}\n`)
  const ctx = { root } as Context
  const [detail, update] = await Promise.all([getCatalogService(ctx).detail(id, prefs), updateDetails(ctx, id, prefs)])
  expect(detail.latest).toBe('2.0.0')
  expect(update.installed).toEqual({ version: '1.0.0', enabled: true, required: false, update: '2.0.0' })
  expect(registry.requests.map(url => url.pathname)).toEqual([`/${id}`])
})

it('keeps dependency evidence stable for a generation and refreshes it for a new context', async () => {
  const { root } = await inventoryProject('export default {}', { vue: '^3', vite: '^7' })
  await inventoryPackage(root, 'vue', '3.5.0')
  await inventoryPackage(root, 'vite', '7.2.0')
  const ctx = { root }
  const service = getCatalogService(ctx)
  const offline = { ...prefs, community: false }
  expect((await service.catalog({ view: 'all', prefs: offline })).project).toEqual({ frameworks: ['vue'], signals: ['vite 7'] })
  await writeFile(join(root, 'package.json'), JSON.stringify({ dependencies: { react: '^19', vite: '^8' } }))
  await inventoryPackage(root, 'vite', '8.1.0')
  expect((await service.catalog({ view: 'all', prefs: offline })).project).toEqual({ frameworks: ['vue'], signals: ['vite 7'] })
  expect((await getCatalogService({ root }).catalog({ view: 'all', prefs: offline })).project).toEqual({ frameworks: ['react'], signals: ['vite 8'] })
})

it('retains only consumer metadata in persisted packuments', async () => {
  const id = 'metadata-plugin'
  const registry = await registryServer({ packages: { [id]: {
    'name': id,
    'readme': 'unused readme',
    'dist-tags': { latest: '1.0.0', next: '2.0.0' },
    'versions': { '1.0.0': { name: id, version: '1.0.0', scripts: { postinstall: 'unused script' }, readme: 'unused version readme', histoire: { marketplace: { ...officialPlugins[0].manifest, frameworks: [], requires: {} } } } },
  } } })
  onTestFinished(registry.close)
  const { root } = await inventoryProject()
  await writeFile(join(root, '.npmrc'), `registry=${registry.url}\n`)
  const service = getCatalogService({ root })
  expect((await service.detail(id, prefs)).latest).toBe('1.0.0')
  clearRegistryMemory(root)
  registry.options.status = 503
  const reloaded = await getCatalogService({ root }).detail(id, prefs)
  expect(reloaded.latest).toBe('1.0.0')
  const directory = join(root, REGISTRY_CACHE_PATH)
  const [file] = await readdir(directory)
  const bytes = await readFile(join(directory, file), 'utf8')
  expect(bytes).not.toContain('unused')
  expect(bytes).not.toContain('postinstall')
})

// A peer installed after initial stack detection must still be read on first use.
// Eager resolution caches its old version; rereading peers loses generation stability.
it('reads only consulted installed versions and captures each peer on first use', async () => {
  const { root } = await inventoryProject(undefined, { vue: '^3', vite: '^7', vitest: '^3', tailwindcss: '^4' })
  await inventoryPackage(root, 'vite', '7.1.0')
  await inventoryPackage(root, 'vitest', '3.0.0')
  const ctx = { root }
  expect((await detectProjectSignals(ctx)).versions).toEqual({ vite: '7.1.0' })
  await inventoryPackage(root, 'vitest', '3.2.0')
  expect((await detectProjectSignals(ctx, ['vitest'])).versions).toEqual({ vite: '7.1.0', vitest: '3.2.0' })
  await inventoryPackage(root, 'vitest', '3.3.0')
  expect((await detectProjectSignals(ctx, ['vitest'])).versions).toEqual({ vite: '7.1.0', vitest: '3.2.0' })
  expect((await detectProjectSignals({ root }, ['vitest'])).versions).toEqual({ vite: '7.1.0', vitest: '3.3.0' })
})
