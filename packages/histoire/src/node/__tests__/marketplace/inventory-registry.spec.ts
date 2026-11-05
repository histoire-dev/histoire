import type { MarketplaceManifest, MarketplacePrefs } from '@histoire/shared'
import type { Context } from '../../context.js'
import { afterEach, describe, expect, it, onTestFinished } from 'vitest'
import { createPluginInventory } from '../../config/plugin-toggle-inventory.js'
import { registerInventoryHandlers } from '../../marketplace/inventory/handlers.js'
import { createRegistryUpdateReader } from '../../marketplace/inventory/registry-versions.js'
import { createUpdateService } from '../../marketplace/inventory/updates.js'
import { disposeConfigProjects } from '../utils/config-codemod.js'
import { registryServer } from '../utils/marketplace/registry-server.js'
import { uiChannelFixture } from '../utils/ui-channel.js'
import { inventoryPackage, inventoryProject } from './inventory-fixture.js'

/** Community consent applies to every registry update read. */
const prefs: MarketplacePrefs = { community: true, packageManager: 'auto', afterInstall: 'ask', skippedVersions: { plugin: '2.0.0' } }
/** Small declarative manifest, independently authored for compatibility cases. */
const manifest: MarketplaceManifest = { displayName: 'Audit', summary: 'Audit stories', category: 'testing', monogram: 'Au', tint: 'slate', frameworks: ['vue'], config: { import: 'Audit' } }

afterEach(disposeConfigProjects)

// Entry: real catalog registry, validator, compatibility and inventory update join over HTTP.
// A newer incompatible/deprecated target must not replace the independently expected 1.1.0.
describe('inventory catalog registry integration', () => {
  it('uses target-version peers, release notes and deprecation, and caches registry reads', async () => {
    const registry = await registryServer({ packages: { plugin: {
      'name': 'plugin',
      'dist-tags': { latest: '5.0.0' },
      'versions': {
        '5.0.0': { name: 'plugin', version: '5.0.0', histoire: { marketplace: manifest }, deprecated: 'Removed' },
        '3.0.0': { name: 'plugin', version: '3.0.0', histoire: { marketplace: manifest }, peerDependencies: { vite: '^8' } },
        '2.0.0': { name: 'plugin', version: '2.0.0', histoire: { marketplace: manifest } },
        '1.1.0': { name: 'plugin', version: '1.1.0', histoire: { marketplace: { ...manifest, releaseNotes: [{ kind: 'breaking', text: 'Changed options' }] } }, peerDependencies: { vite: '^7', absent: '*' }, peerDependenciesMeta: { absent: { optional: true } } },
      },
    } } })
    onTestFinished(registry.close)
    const { root } = await inventoryProject(undefined, { plugin: '1.0.0', vite: '^7', vue: '^3' })
    await inventoryPackage(root, 'plugin', '1.0.0')
    await inventoryPackage(root, 'vite', '7.2.0')
    await inventoryPackage(root, 'vue', '3.5.0')
    const ctx = { root, config: { plugins: [{ name: 'plugin' }] }, mode: 'dev' } as Context
    ctx.pluginInventory = (await createPluginInventory(ctx)).rows
    const service = createUpdateService(ctx, createRegistryUpdateReader(ctx, { registryUrl: registry.url }))
    expect(await service.updates(prefs)).toEqual([{ id: 'plugin', from: '1.0.0', to: '1.1.0', breaking: true }])
    expect(await service.updates({ ...prefs, skippedVersions: {} })).toEqual([{ id: 'plugin', from: '1.0.0', to: '2.0.0', breaking: true }])
    expect(registry.requests.map(url => url.pathname)).toEqual(['/plugin'])
    expect(await service.updates({ ...prefs, community: false })).toEqual([])
    expect(registry.requests).toHaveLength(1)
  })

  it('uses bundled official releases with community off and never constructs a registry client', async () => {
    const { root } = await inventoryProject()
    const reader = createRegistryUpdateReader({ root } as Context, { registryUrl: 'invalid url' })
    const versions = await reader('@histoire/plugin-a11y', { ...prefs, community: false })
    expect(versions).toMatchObject([{ version: '1.0.0-beta.1', compatible: true }])
    expect(await reader('community', { ...prefs, community: false })).toEqual([])
  })

  it('wires real inventory requests to bundled updates without an injected reader', async () => {
    const { root } = await inventoryProject()
    await inventoryPackage(root, '@histoire/plugin-a11y', '1.0.0-beta.0')
    const ctx = { root, mode: 'dev', config: { plugins: [{ name: '@histoire/plugin-a11y' }] } } as Context
    ctx.pluginInventory = (await createPluginInventory(ctx)).rows
    const fixture = uiChannelFixture()
    onTestFinished(() => fixture.channel.close())
    registerInventoryHandlers(ctx, fixture.channel, () => true)
    await fixture.request('histoire:ui:marketplace-updates', { requestId: 'bundled', prefs: { ...prefs, community: false } })
    expect(fixture.client.send).toHaveBeenCalledWith('histoire:ui:marketplace-updates-result', { requestId: 'bundled', updates: [{ id: '@histoire/plugin-a11y', from: '1.0.0-beta.0', to: '1.0.0-beta.1', breaking: false }] })
  })
})
