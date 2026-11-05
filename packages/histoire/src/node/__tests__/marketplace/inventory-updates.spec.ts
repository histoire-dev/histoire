import type { MarketplacePrefs } from '@histoire/shared'
import type { Context } from '../../context.js'
import { afterEach, describe, expect, it, onTestFinished } from 'vitest'
import { marketplaceDefaults } from '../../../../../histoire-app/src/app/util/marketplace-preferences.js'
import { createPluginInventory } from '../../config/plugin-toggle-inventory.js'
import { registerInventoryHandlers } from '../../marketplace/inventory/handlers.js'
import { createUpdateService, selectUpdate } from '../../marketplace/inventory/updates.js'
import { disposeConfigProjects } from '../utils/config-codemod.js'
import { uiChannelFixture } from '../utils/ui-channel.js'
import { inventoryPackage, inventoryProject } from './inventory-fixture.js'

/** Browser preferences; exact target dismissal must not hide another plugin's update. */
const prefs: MarketplacePrefs = { ...marketplaceDefaults(), community: true, afterInstall: 'ask' as const, skippedVersions: { plugin: '2.0.0' } }

afterEach(disposeConfigProjects)

// Boundary: real update selection/cache/channel, injected external registry reads only.
// Unsorted, incompatible, deprecated, prerelease and dismissed targets reject naïve latest joins.
describe('installed plugin updates', () => {
  it('chooses highest compatible newer release, skipping deprecated and dismissed versions', () => {
    const versions = [
      { version: '1.10.0', compatible: true },
      { version: '1.9.0', compatible: true },
      { version: '1.11.0', compatible: true, releaseNotes: [{ kind: 'breaking' as const, text: 'Changed options' }] },
      { version: '2.0.0', compatible: true },
      { version: '3.0.0', compatible: false },
      { version: '4.0.0', compatible: true, deprecated: true },
      { version: '5.0.0-beta.1', compatible: true },
      { version: 'bad', compatible: true },
    ]
    expect(selectUpdate('plugin', '1.8.0', versions, prefs)).toEqual({ id: 'plugin', from: '1.8.0', to: '1.11.0', breaking: true })
    expect(selectUpdate('other', '1.8.0', versions, prefs)).toEqual({ id: 'other', from: '1.8.0', to: '2.0.0', breaking: true })
    expect(selectUpdate('plugin', 'local', versions, prefs)).toBeUndefined()
    expect(selectUpdate('plugin', '4.0.0', versions, prefs)).toBeUndefined()
    expect(selectUpdate('plugin', '1.10.0', [{ version: '1.10.1', compatible: true }], prefs)?.breaking).toBe(false)
    expect(selectUpdate('plugin', '1.0.0-beta.2', [{ version: '1.0.0-beta.11', compatible: true }], prefs)?.to).toBe('1.0.0-beta.11')
  })

  it('checks every installed package, retains pinned updates, caches one hour, and reapplies preferences', async () => {
    const { root } = await inventoryProject(undefined, { plugin: '1.0.0', second: '^1', local: 'workspace:*' })
    for (const name of ['plugin', 'second', 'local']) await inventoryPackage(root, name, '1.0.0')
    const ctx = { root, mode: 'dev', config: { plugins: ['plugin', 'second', 'local'].map(name => ({ name })) } } as Context
    ctx.pluginInventory = (await createPluginInventory(ctx)).rows
    const reads: string[] = []
    let now = 0
    const service = createUpdateService(ctx, async (id) => {
      reads.push(id)
      return [{ version: '2.0.0', compatible: true }, { version: '1.1.0', compatible: true }]
    }, () => now)
    expect(await service.updates(prefs)).toEqual([{ id: 'plugin', from: '1.0.0', to: '1.1.0', breaking: false }, { id: 'second', from: '1.0.0', to: '2.0.0', breaking: true }])
    expect(ctx.pluginInventory.find(row => row.name === 'plugin')).toMatchObject({ pinned: true })
    expect(reads).toEqual(['plugin', 'second'])
    expect((await service.updates({ ...prefs, skippedVersions: {} }))[0].to).toBe('2.0.0')
    now = 3_599_999
    await service.updates(prefs)
    expect(reads).toHaveLength(2)
    now = 3_600_000
    await service.updates(prefs)
    expect(reads).toEqual(['plugin', 'second', 'plugin', 'second'])
    await service.updates({ ...prefs, community: false })
    expect(reads).toHaveLength(4)
  })

  it('answers correlated requests privately and suppresses held replies after retirement', async () => {
    const { root } = await inventoryProject()
    await inventoryPackage(root, '@histoire/plugin-a11y', '1.0.0')
    const ctx = { root, mode: 'dev', config: { plugins: [{ name: '@histoire/plugin-a11y' }] } } as Context
    ctx.pluginInventory = (await createPluginInventory(ctx)).rows
    let active = true
    const fixture = uiChannelFixture(() => active)
    onTestFinished(() => fixture.channel.close())
    let release: (() => void) | undefined
    onTestFinished(() => release?.())
    let held = false
    registerInventoryHandlers(ctx, fixture.channel, () => active, async () => {
      if (held) {
        await new Promise<void>((resolve) => {
          release = resolve
        })
      }
      return [{ version: '1.1.0', compatible: true }]
    })
    await fixture.request('histoire:ui:marketplace-updates', { requestId: 'first', prefs })
    expect(fixture.client.send).toHaveBeenLastCalledWith('histoire:ui:marketplace-updates-result', { requestId: 'first', updates: [{ id: '@histoire/plugin-a11y', from: '1.0.0', to: '1.1.0', breaking: false }] })
    await fixture.request('histoire:ui:marketplace-updates', { requestId: 'invalid', prefs: { ...prefs, community: 'yes' } })
    expect(fixture.client.send).toHaveBeenLastCalledWith('histoire:ui:marketplace-updates-result', { requestId: 'invalid', error: { code: 'invalid', message: 'Invalid marketplace preferences' } })
    // A fresh preference source forces a real held registry read instead of the cache.
    held = true
    const pending = fixture.request('histoire:ui:marketplace-updates', { requestId: 'retired', prefs: { ...prefs, community: false } })
    await expect.poll(() => Boolean(release)).toBe(true)
    active = false
    release!()
    await pending
    expect(fixture.client.send).toHaveBeenCalledTimes(2)
    expect(fixture.ws.send).not.toHaveBeenCalled()
  })

  it('reports registry failure without caching it, then coalesces concurrent retries', async () => {
    const { root } = await inventoryProject()
    await inventoryPackage(root, '@histoire/plugin-a11y', '1.0.0')
    const ctx = { root, mode: 'dev', config: { plugins: [{ name: '@histoire/plugin-a11y' }] } } as Context
    ctx.pluginInventory = (await createPluginInventory(ctx)).rows
    const fixture = uiChannelFixture()
    onTestFinished(() => fixture.channel.close())
    let calls = 0
    registerInventoryHandlers(ctx, fixture.channel, () => true, async () => {
      calls++
      if (calls === 1) throw new Error('registry unavailable')
      return [{ version: '1.1.0', compatible: true }]
    })
    await fixture.request('histoire:ui:marketplace-updates', { requestId: 'failed', prefs })
    expect(fixture.client.send).toHaveBeenLastCalledWith('histoire:ui:marketplace-updates-result', { requestId: 'failed', error: { code: 'failed', message: 'Could not check plugin updates' } })
    await Promise.all(['retry-one', 'retry-two'].map(requestId => fixture.request('histoire:ui:marketplace-updates', { requestId, prefs })))
    expect(calls).toBe(2)
    for (const requestId of ['retry-one', 'retry-two']) {
      expect(fixture.client.send).toHaveBeenCalledWith('histoire:ui:marketplace-updates-result', { requestId, updates: [{ id: '@histoire/plugin-a11y', from: '1.0.0', to: '1.1.0', breaking: false }] })
    }
  })
})
