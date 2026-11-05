import type { Context } from '../../context.js'
import { afterEach, expect, it, onTestFinished, vi } from 'vitest'
import { marketplaceDefaults } from '../../../../../histoire-app/src/app/util/marketplace-preferences.js'
import { registerMigrationHandlers } from '../../marketplace/migrations/handlers.js'
import { disposeConfigProjects } from '../utils/config-codemod.js'
import { uiChannelFixture } from '../utils/ui-channel.js'
import { inventoryPackage, inventoryProject } from './inventory-fixture.js'

const prefs = { ...marketplaceDefaults(), afterInstall: 'ask' as const }
afterEach(async () => {
  vi.unstubAllEnvs()
  await disposeConfigProjects()
})

it('keeps update metadata bundled with consent off and validates requests before work', async () => {
  vi.stubEnv('npm_config_registry', 'invalid registry URL')
  const { root } = await inventoryProject()
  await inventoryPackage(root, '@histoire/plugin-a11y', '1.0.0-beta.0')
  const fixture = uiChannelFixture()
  onTestFinished(() => fixture.channel.close())
  registerMigrationHandlers({ root, mode: 'dev' } as Context, fixture.channel, () => true)
  await fixture.request('histoire:ui:marketplace-update-detail', { requestId: 'invalid', id: '../secret', prefs })
  expect(fixture.client.send).toHaveBeenLastCalledWith('histoire:ui:marketplace-update-detail-result', { requestId: 'invalid', error: { code: 'invalid', message: 'Invalid plugin update request' } })
  await fixture.request('histoire:ui:marketplace-update-detail', { requestId: 'bundled', id: '@histoire/plugin-a11y', prefs })
  expect(fixture.client.send).toHaveBeenLastCalledWith('histoire:ui:marketplace-update-detail-result', {
    requestId: 'bundled',
    detail: expect.objectContaining({ id: '@histoire/plugin-a11y', official: true, latest: '1.0.0-beta.1', installed: expect.objectContaining({ version: '1.0.0-beta.0', update: '1.0.0-beta.1' }) }),
  })
  // A community package cannot be read through the update endpoint without consent.
  await inventoryPackage(root, 'community-plugin', '0.1.0')
  await fixture.request('histoire:ui:marketplace-update-detail', { requestId: 'community', id: 'community-plugin', prefs })
  expect(fixture.client.send).toHaveBeenLastCalledWith('histoire:ui:marketplace-update-detail-result', { requestId: 'community', error: { code: 'unavailable', message: 'No compatible update is available' } })
  expect(fixture.ws.send).not.toHaveBeenCalled()
})

it('does not start metadata reads after generation retirement', async () => {
  const fixture = uiChannelFixture()
  onTestFinished(() => fixture.channel.close())
  registerMigrationHandlers({ mode: 'dev' } as Context, fixture.channel, () => false)
  await fixture.request('histoire:ui:marketplace-update-detail', { requestId: 'retired', id: '@histoire/plugin-a11y', prefs })
  expect(fixture.client.send).not.toHaveBeenCalled()
})
