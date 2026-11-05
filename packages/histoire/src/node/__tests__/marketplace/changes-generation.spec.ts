import type { ChangeRequest } from '@histoire/shared'
import type { Context } from '../../context.js'
import { chmod, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { afterEach, expect, it, onTestFinished } from 'vitest'
import { marketplaceDefaults } from '../../../../../histoire-app/src/app/util/marketplace-preferences.js'
import { createCatalogService } from '../../marketplace/catalog/service.js'
import { getPlanStore } from '../../marketplace/changes/handlers.js'
import { registerMarketplaceChannels } from '../../marketplace/channel.js'
import { disposeConfigProjects } from '../utils/config-codemod.js'
import { registryServer } from '../utils/marketplace/registry-server.js'
import { uiChannelFixture } from '../utils/ui-channel.js'
import { denyRegistryCacheWrites } from './catalog-cache-fixture.js'
import { inventoryPackage, inventoryProject } from './inventory-fixture.js'
import { jobManifest } from './jobs-fixture.js'

/** Consent is explicit, and npm override avoids unrelated manager detection. */
const prefs: ChangeRequest['prefs'] = { ...marketplaceDefaults(), community: true, packageManager: 'npm' as const, afterInstall: 'ask' as const }
/** History needs both intervening and target migrations, in version order. */
const pkg = {
  'name': 'test-plugin',
  'dist-tags': { latest: '2.0.0' },
  'versions': {
    '1.0.0': { name: 'test-plugin', version: '1.0.0', histoire: { marketplace: { ...jobManifest, migrations: [{ from: '<1', ops: [{ op: 'rename-option', from: 'old', to: 'middle' }] }] } } },
    '2.0.0': { name: 'test-plugin', version: '2.0.0', histoire: { marketplace: { ...jobManifest, migrations: [{ from: '<2', ops: [{ op: 'rename-option', from: 'middle', to: 'current' }] }] } } },
  },
}

afterEach(disposeConfigProjects)

// Real detail, planner, migration review and channel cleanup. Only registry is
// substituted. Missing shared memory must reject planning; a missing cleanup
// hook must leave metadata available after channel close, failing the last check.
it.each(['install', 'update'] as const)('reviews %s after detail despite denied disk persistence, then retires metadata', async (kind) => {
  const registry = await registryServer({ packages: { [pkg.name]: pkg } })
  onTestFinished(registry.close)
  const code = kind === 'update'
    ? 'import { TestPlugin } from "test-plugin"\nexport default { plugins: [TestPlugin({ old: "secret", keep: true })] }\n'
    : 'export default {}\n'
  const { root, file } = await inventoryProject(code, kind === 'update' ? { [pkg.name]: '^0.3.0' } : {})
  await writeFile(`${root}/.npmrc`, `registry=${registry.url}\n`)
  if (kind === 'update') await inventoryPackage(root, pkg.name, '0.3.0')
  const directory = await denyRegistryCacheWrites(root)
  const ctx = { root, configFile: file, mode: 'dev' } as Context
  const channel = uiChannelFixture()
  onTestFinished(() => channel.channel.close())
  registerMarketplaceChannels(ctx, channel.channel, () => true)
  const service = createCatalogService(ctx, { registryUrl: registry.url })
  expect((await service.detail(pkg.name, prefs)).latest).toBe('2.0.0')
  expect(await readdir(directory)).toEqual([])
  // Allow writes now so an accidental write during review becomes observable.
  await chmod(directory, 0o700)
  const before = await stat(directory)
  const packageBefore = await readFile(`${root}/package.json`, 'utf8')
  const pathsBefore = await readdir(root, { recursive: true })
  const request: ChangeRequest = { kind, id: pkg.name, version: '2.0.0', migrate: kind === 'update', prefs }
  const store = getPlanStore(ctx)
  const plan = await store.plan(request)
  expect(plan.manual).toBeUndefined()
  expect(plan.command?.argv).toContain('test-plugin@2.0.0')
  const reviewed = await store.verifyPlan(plan.planId, plan.hash)
  if (kind === 'update') {
    expect(reviewed.configCode).toMatch(/current:\s*(['"])secret\1/)
    expect(reviewed.configCode).toContain('keep: true')
    expect(reviewed.configCode).not.toMatch(/(?:old|middle):/)
  }
  else {
    expect(reviewed.configCode).toContain('TestPlugin()')
  }
  expect(registry.requests.map(url => url.pathname)).toEqual(['/test-plugin'])
  expect(await readFile(file, 'utf8')).toBe(code)
  expect(await readFile(`${root}/package.json`, 'utf8')).toBe(packageBefore)
  expect(await readdir(root, { recursive: true })).toEqual(pathsBefore)
  expect((await stat(directory)).mtimeMs).toBe(before.mtimeMs)
  await channel.channel.close()
  // Fresh generation cannot plan from memory owned by the disposed channel.
  const next = getPlanStore({ ...ctx })
  await expect(next.plan(request)).rejects.toMatchObject({ code: 'unavailable' })
  expect(registry.requests).toHaveLength(1)
})
