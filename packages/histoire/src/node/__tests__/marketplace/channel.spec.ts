import type { Context } from '../../context.js'
import { describe, expect, it, onTestFinished } from 'vitest'
import { registerMarketplaceChannels } from '../../marketplace/channel.js'
import { uiChannelFixture } from '../utils/ui-channel.js'

describe('marketplace channel', () => {
  it('drops malformed correlation IDs and suppresses replies after generation retirement', async () => {
    let active = true
    const fixture = uiChannelFixture(() => active)
    onTestFinished(() => fixture.channel.close())
    registerMarketplaceChannels({} as Context, fixture.channel, () => active)
    await fixture.request('histoire:ui:marketplace-catalog', { requestId: '' })
    expect(fixture.client.send).not.toHaveBeenCalled()
    active = false
    await fixture.request('histoire:ui:marketplace-catalog', { requestId: 'late' })
    expect(fixture.client.send).not.toHaveBeenCalled()
  })
})
