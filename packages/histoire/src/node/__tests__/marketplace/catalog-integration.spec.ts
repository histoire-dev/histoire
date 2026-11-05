import type { Context } from '../../context.js'
import { afterEach, expect, it, onTestFinished } from 'vitest'
import { registerCatalogHandlers } from '../../marketplace/catalog/handlers.js'
import { officialPlugins } from '../../marketplace/catalog/official.js'
import { createCatalogService } from '../../marketplace/catalog/service.js'
import { catalogQuerySchema } from '../../marketplace/catalog/validation.js'
import { configTestProject, disposeConfigProjects } from '../utils/config-codemod.js'
import { registryServer } from '../utils/marketplace/registry-server.js'
import { uiChannelFixture } from '../utils/ui-channel.js'

const prefs = { community: true, packageManager: 'auto' as const, afterInstall: 'ask' as const, skippedVersions: {} }
afterEach(disposeConfigProjects)

it('filters complete collection membership before pagination and facet alternatives', async () => {
  const names = Array.from({ length: 14 }, (_, index) => `collection-${String(index).padStart(2, '0')}`)
  const packages = Object.fromEntries([...names, 'excluded'].map(name => [name, {
    'name': name,
    'dist-tags': { latest: '1.0.0' },
    'versions': { '1.0.0': { name, version: '1.0.0', histoire: { marketplace: {
      ...officialPlugins[0].manifest,
      displayName: name,
      frameworks: [],
      category: name === names[13] ? 'design' : 'testing',
      collections: name === 'excluded' ? [] : ['integration'],
    } } } },
  }]))
  const registry = await registryServer({ packages })
  onTestFinished(registry.close)
  const { root } = await configTestProject()
  const service = createCatalogService({ root }, { registryUrl: registry.url })
  const query = { view: 'all' as const, prefs, filters: { collection: 'integration' }, sort: 'name' as const, limit: 12 }
  expect(catalogQuerySchema.parse(query).filters).toEqual({ collection: 'integration' })
  expect(catalogQuerySchema.safeParse({ ...query, filters: { collection: '' } }).success).toBe(false)
  expect(catalogQuerySchema.safeParse({ ...query, filters: { collection: 'x'.repeat(101) } }).success).toBe(false)
  const first = await service.catalog(query)
  expect(first.entries.map(entry => entry.id)).toEqual(names.slice(0, 12))
  expect(first.total).toBe(14)
  expect(first.facets.category).toEqual({ testing: 13, design: 1, inspection: 0, frameworks: 0, data: 0 })
  expect(first.facets.official).toBe(0)
  const second = await service.catalog({ ...query, cursor: first.cursor })
  expect(second.entries.map(entry => entry.id)).toEqual(names.slice(12))
  expect(second.cursor).toBeUndefined()
  const testing = await service.catalog({ ...query, filters: { ...query.filters, category: 'testing' } })
  expect(testing.total).toBe(13)
  expect(testing.facets.category.design).toBe(1)
})

it('returns typed not-found replies and official version reasons without registry consent', async () => {
  const { root } = await configTestProject()
  const offline = { ...prefs, community: false }
  const service = createCatalogService({ root })
  const detail = await service.detail('@histoire/plugin-react', offline)
  expect(detail.versions[0]).toMatchObject({ compatible: false, reason: 'Needs react' })
  await expect(service.detail('missing-plugin', offline)).rejects.toMatchObject({ code: 'not-found' })
  const fixture = uiChannelFixture()
  onTestFinished(() => fixture.channel.close())
  registerCatalogHandlers({ root } as Context, fixture.channel, () => true)
  await fixture.request('histoire:ui:marketplace-detail', { requestId: 'missing', id: 'missing-plugin', prefs: offline })
  expect(fixture.client.send).toHaveBeenLastCalledWith('histoire:ui:marketplace-detail-result', { requestId: 'missing', error: { code: 'not-found', message: 'Plugin not found' } })
})

it('classifies registry 404 as missing while leaving registry failures retryable', async () => {
  const registry = await registryServer({ status: 404 })
  onTestFinished(registry.close)
  const { root } = await configTestProject()
  const service = createCatalogService({ root }, { registryUrl: registry.url })
  await expect(service.detail('missing-plugin', prefs)).rejects.toMatchObject({ code: 'not-found' })
  registry.options.status = 503
  await expect(service.detail('missing-plugin', prefs)).rejects.toThrow('Registry HTTP 503')
})
