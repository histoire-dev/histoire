import type { MarketplacePrefs } from '@histoire/shared'
import type { Context } from '../../context.js'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'pathe'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { marketplaceDefaults } from '../../../../../histoire-app/src/app/util/marketplace-preferences.js'
import { registerCatalogHandlers } from '../../marketplace/catalog/handlers.js'
import { createRegistryClient } from '../../marketplace/catalog/registry.js'
import { createCatalogService } from '../../marketplace/catalog/service.js'
import { projectPluginResolver } from '../../marketplace/changes/resolve-plugin.js'
import { createRegistryUpdateReader } from '../../marketplace/inventory/registry-versions.js'
import { suggestVersion } from '../../marketplace/jobs/failure.js'
import { readReleases } from '../../marketplace/migrations/releases.js'
import { configTestProject, disposeConfigProjects } from '../utils/config-codemod.js'
import { registryServer } from '../utils/marketplace/registry-server.js'
import { uiChannelFixture } from '../utils/ui-channel.js'

/** Explicit consent for real catalog, planning, migration and update consumers. */
const prefs: MarketplacePrefs = { ...marketplaceDefaults(), community: true, packageManager: 'npm' as const, afterInstall: 'ask' as const }
/** Distinct test secret must never appear in persisted responses or channel replies. */
const token = 'marketplace-private-token-19'
/** One declarative fixture package reused across the actual consumer paths. */
const pkg = {
  'name': '@acme/plugin-x',
  'dist-tags': { latest: '2.0.0' },
  'versions': { '2.0.0': { name: '@acme/plugin-x', version: '2.0.0', peerDependencies: { vite: '^6' }, peerDependenciesMeta: { vite: { optional: true } }, histoire: { marketplace: { displayName: 'Private plugin', summary: 'Private checks', category: 'testing', monogram: 'P', tint: 'blue', config: { import: 'PrivatePlugin' } } } } },
}

beforeEach(async () => {
  const { root } = await configTestProject()
  vi.stubEnv('HOME', root)
  vi.stubEnv('npm_config_userconfig', join(root, '.npmrc'))
  vi.stubEnv('npm_config_registry', '')
  vi.stubEnv('NPM_CONFIG_REGISTRY', '')
})
afterEach(async () => {
  vi.unstubAllEnvs()
  await disposeConfigProjects()
})

/** Allocate the existing HTTP boundary and register cleanup immediately. */
async function server(options: Parameters<typeof registryServer>[0] = {}) {
  const registry = await registryServer(options)
  onTestFinished(registry.close)
  return registry
}

// Real HTTP/client/cache/channel and read-only consumers. Auth-required server
// rejects dropped credentials; separate ports and paths expose credential leaks.
describe('authenticated registry consumers', () => {
  it('routes search to default and scoped metadata to private registry, sharing read-only cache keys', async () => {
    const privateRegistry = await server({ basePath: '/team/', authorization: `Bearer ${token}`, packages: { [pkg.name]: pkg } })
    const publicRegistry = await server({ names: [pkg.name] })
    const { root } = await configTestProject()
    await writeFile(join(root, '.npmrc'), `registry=${publicRegistry.url}\n@acme:registry=${privateRegistry.url}/team/\n//${new URL(privateRegistry.url).host}/team/:_authToken=${token}`)
    const fixture = uiChannelFixture()
    onTestFinished(() => fixture.channel.close())
    registerCatalogHandlers({ root } as Context, fixture.channel, () => true)
    await fixture.request('histoire:ui:marketplace-catalog', { requestId: 'catalog', query: { view: 'all', prefs } })
    expect(fixture.client.send).toHaveBeenLastCalledWith('histoire:ui:marketplace-catalog-result', expect.objectContaining({ page: expect.objectContaining({ sources: { official: 'ok', community: 'ok' }, entries: expect.arrayContaining([expect.objectContaining({ id: pkg.name })]) }) }))
    await fixture.request('histoire:ui:marketplace-detail', { requestId: 'detail', id: pkg.name, prefs })
    expect(fixture.client.send).toHaveBeenLastCalledWith('histoire:ui:marketplace-detail-result', expect.objectContaining({ detail: expect.objectContaining({ id: pkg.name, latest: '2.0.0' }) }))
    expect(publicRegistry.requests.map(url => url.pathname)).toEqual(['/-/v1/search'])
    expect(publicRegistry.headers.map(header => header.authorization)).toEqual([undefined])
    expect(privateRegistry.requests.map(url => url.pathname)).toEqual(['/team/%40acme%2Fplugin-x'])
    expect(privateRegistry.headers.map(header => header.authorization)).toEqual([`Bearer ${token}`])
    const directory = join(root, 'node_modules/.cache/histoire/marketplace/registry')
    const files = await readdir(directory)
    const before = await Promise.all(files.map(file => readFile(join(directory, file), 'utf8')))
    const resolved = await projectPluginResolver(root)({ kind: 'install', id: pkg.name, prefs })
    expect(resolved).toMatchObject({ version: '2.0.0', manifest: { config: { import: 'PrivatePlugin' } } })
    expect((await readReleases(root, pkg.name, prefs, true)).map(release => release.latest)).toEqual(['2.0.0'])
    expect(await createRegistryUpdateReader({ root } as Context)(pkg.name, prefs)).toMatchObject([{ version: '2.0.0', compatible: true }])
    expect((await readReleases(root, pkg.name, prefs)).map(release => release.latest)).toEqual(['2.0.0'])
    expect(await suggestVersion(root, pkg.name, { code: 'peer-conflict', message: 'Peer conflict', peer: 'vite', found: '6.1.0' })).toEqual({ version: '2.0.0', reason: 'Last version that supports vite 6' })
    // Removing credentials preserves exact cache identity; no new request or file.
    await writeFile(join(root, '.npmrc'), `registry=${publicRegistry.url}\n@acme:registry=${privateRegistry.url}/team/`)
    expect((await createRegistryClient(root).packument(pkg.name)).value.name).toBe(pkg.name)
    expect(await readdir(directory)).toEqual(files)
    expect(await Promise.all(files.map(file => readFile(join(directory, file), 'utf8')))).toEqual(before)
    expect(JSON.stringify([files, before, fixture.client.send.mock.calls])).not.toContain(token)
    expect(privateRegistry.requests).toHaveLength(1)
  })

  it.each([
    ':_auth=YWxpY2U6cGFzc3dvcmQ=',
    ':username=alice\nPREFIX:_password=cGFzc3dvcmQ=',
  ])('sends npm Basic credentials over HTTP for %s', async (credentials) => {
    const registry = await server({ authorization: 'Basic YWxpY2U6cGFzc3dvcmQ=', packages: { [pkg.name]: pkg } })
    const { root } = await configTestProject()
    const prefix = `//${new URL(registry.url).host}/`
    await writeFile(join(root, '.npmrc'), `registry=${registry.url}\n${prefix}${credentials.replace('PREFIX', prefix)}`)
    expect((await createRegistryClient(root).packument(pkg.name)).value.name).toBe(pkg.name)
    expect(registry.headers.map(header => header.authorization)).toEqual(['Basic YWxpY2U6cGFzc3dvcmQ='])
  })

  it('never sends path-scoped credentials outside their path or across redirects', async () => {
    const target = await server({ packages: { [pkg.name]: pkg } })
    const origin = await server({ packages: { [pkg.name]: pkg } })
    const { root } = await configTestProject()
    await writeFile(join(root, '.npmrc'), `//${new URL(origin.url).host}/private/:_authToken=${token}`)
    await createRegistryClient(root, { registryUrl: origin.url }).packument(pkg.name)
    origin.options.basePath = '/private-other/'
    await createRegistryClient(root, { registryUrl: `${origin.url}/private-other/` }).catalog()
    await createRegistryClient(root, { registryUrl: target.url }).packument(pkg.name)
    expect([...origin.headers, ...target.headers].every(header => !header.authorization)).toBe(true)
    origin.options.authorization = `Bearer ${token}`
    origin.options.redirect = `${target.url}/plugin`
    await expect(createRegistryClient(root, { registryUrl: `${origin.url}/private/` }).catalog()).rejects.toThrow()
    expect(origin.headers.at(-1)?.authorization).toBe(`Bearer ${token}`)
    expect(target.requests).toHaveLength(1)
  })

  it.each([401, 403])('maps HTTP %s to community error and safe host diagnostic', async (status) => {
    const registry = await server({ status, body: `server echoes ${token}` })
    const { root } = await configTestProject()
    await writeFile(join(root, '.npmrc'), `registry=${registry.url}\n//${new URL(registry.url).host}/:_authToken=${token}`)
    const service = createCatalogService({ root })
    expect((await service.catalog({ view: 'all', prefs })).sources.community).toBe('error')
    await expect(createRegistryClient(root).packument(pkg.name)).rejects.toThrow(`Registry HTTP ${status} (${new URL(registry.url).host})`)
    await expect(createRegistryClient(root).packument(pkg.name)).rejects.not.toThrow(token)
    const fixture = uiChannelFixture()
    onTestFinished(() => fixture.channel.close())
    registerCatalogHandlers({ root } as Context, fixture.channel, () => true)
    await fixture.request('histoire:ui:marketplace-detail', { requestId: 'denied', id: pkg.name, prefs })
    expect(fixture.client.send).toHaveBeenLastCalledWith('histoire:ui:marketplace-detail-result', { requestId: 'denied', error: { code: 'failed', message: 'Could not load plugin catalog' } })
    expect(JSON.stringify(fixture.client.send.mock.calls)).not.toContain(token)
  })
})
