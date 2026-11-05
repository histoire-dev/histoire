import type { PluginDetail } from '../../../../histoire-shared/src/index.js'
import { expect, it } from 'vitest'
import { createMarketplaceClient } from '../../../../histoire-app/src/app/util/marketplace-client.js'
import { officialPlugins } from '../utils/marketplace-official.js'
import { createMarketplaceTransport } from '../utils/marketplace-transport.js'

it('filters static collection pages and facets and preserves version reasons and not-found code', async () => {
  const channel = createMarketplaceTransport()
  const entries: PluginDetail[] = Array.from({ length: 15 }, (_, index) => ({
    ...structuredClone(officialPlugins[0]) as PluginDetail,
    id: `plugin-${index}`,
    displayName: `Plugin ${String(index).padStart(2, '0')}`,
    category: index === 14 ? 'data' : 'testing',
    manifest: { ...officialPlugins[0].manifest, collections: index === 14 ? [] : ['integration'] },
  }))
  entries[0].compatible = { ok: false, reason: 'Needs vue' }
  entries[0].versions = [{ version: entries[0].latest, compatible: false }, { version: '0.1.0', compatible: false, reason: 'Needs vite ^8.0.0' }]
  const client = createMarketplaceClient({ transport: { ...channel.transport, available: () => false }, loadOfficial: async () => entries })
  const prefs = { community: false, packageManager: 'auto' as const, afterInstall: 'ask' as const, skippedVersions: {} }
  const query = { view: 'all' as const, prefs, filters: { collection: 'integration' }, sort: 'name' as const, limit: 12 }
  const first = await client.catalog(query)
  expect(first.entries.map(entry => entry.id)).toEqual(Array.from({ length: 12 }, (_, index) => `plugin-${index}`))
  expect(first.total).toBe(14)
  expect(first.facets.category).toEqual({ testing: 14, design: 0, inspection: 0, frameworks: 0, data: 0 })
  const second = await client.catalog({ ...query, cursor: first.cursor })
  expect(second.entries.map(entry => entry.id)).toEqual(['plugin-12', 'plugin-13'])
  expect(second.cursor).toBeUndefined()
  expect((await client.detail('plugin-0', prefs)).versions).toEqual([
    { version: entries[0].latest, compatible: false, reason: 'Needs vue' },
    { version: '0.1.0', compatible: false, reason: 'Needs vite ^8.0.0' },
  ])
  await expect(client.detail('missing', prefs)).rejects.toMatchObject({ code: 'not-found' })
  expect(channel.sent).toEqual([])
  expect(entries[0].versions[0]).not.toHaveProperty('reason')
})
