import type { MarketplacePrefs } from '@histoire/shared'
import type { Context } from '../../context.js'
import { afterEach, describe, expect, it, onTestFinished } from 'vitest'
import { registerCatalogHandlers } from '../../marketplace/catalog/handlers.js'
import { configTestProject, disposeConfigProjects } from '../utils/config-codemod.js'
import { uiChannelFixture } from '../utils/ui-channel.js'

/** Offline policy protects this test against external registry contact. */
const prefs: MarketplacePrefs = { community: false, packageManager: 'auto', afterInstall: 'ask', skippedVersions: {} }

afterEach(disposeConfigProjects)

describe('catalog channel', () => {
  it('answers correlated reads privately and reports invalid queries without a timeout', async () => {
    const { root } = await configTestProject()
    const fixture = uiChannelFixture()
    onTestFinished(() => fixture.channel.close())
    registerCatalogHandlers({ root } as Context, fixture.channel, () => true)
    await fixture.request('histoire:ui:marketplace-catalog', { requestId: 'query', query: { view: 'all', prefs, limit: 1 } })
    expect(fixture.client.send).toHaveBeenLastCalledWith('histoire:ui:marketplace-catalog-result', expect.objectContaining({ requestId: 'query', page: expect.objectContaining({ entries: expect.any(Array), cursor: '1', total: 10 }) }))
    await fixture.request('histoire:ui:marketplace-detail', { requestId: 'detail', id: '@histoire/plugin-a11y', prefs })
    expect(fixture.client.send).toHaveBeenLastCalledWith('histoire:ui:marketplace-detail-result', expect.objectContaining({ requestId: 'detail', detail: expect.objectContaining({ id: '@histoire/plugin-a11y' }) }))
    await fixture.request('histoire:ui:marketplace-catalog', { requestId: 'invalid', query: { view: 'all', prefs, limit: 61 } })
    expect(fixture.client.send).toHaveBeenLastCalledWith('histoire:ui:marketplace-catalog-result', { requestId: 'invalid', error: { code: 'invalid', message: 'Invalid marketplace request' } })
    expect(fixture.ws.send).not.toHaveBeenCalled()
  })

  it('suppresses completion after generation retirement or requester disconnect', async () => {
    const { root } = await configTestProject()
    let active = true
    const fixture = uiChannelFixture(() => active)
    onTestFinished(() => fixture.channel.close())
    registerCatalogHandlers({ root } as Context, fixture.channel, () => active)
    const request = fixture.request('histoire:ui:marketplace-catalog', { requestId: 'retired', query: { view: 'all', prefs } })
    active = false
    await request
    expect(fixture.client.send).not.toHaveBeenCalled()
    active = true
    const disconnected = fixture.request('histoire:ui:marketplace-detail', { requestId: 'disconnected', id: '@histoire/plugin-a11y', prefs })
    fixture.client.disconnect()
    await disconnected
    expect(fixture.client.send).not.toHaveBeenCalled()
  })
})
