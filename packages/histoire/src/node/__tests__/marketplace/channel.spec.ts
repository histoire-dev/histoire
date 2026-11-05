import { describe, expect, it, onTestFinished } from 'vitest'
import { closeContext, createContext } from '../../context.js'
import { registerMarketplaceChannels } from '../../marketplace/channel.js'
import { configTestProject, disposeConfigProjects } from '../utils/config-codemod.js'
import { uiChannelFixture } from '../utils/ui-channel.js'

describe('marketplace channel', () => {
  it('drops malformed correlation IDs and suppresses replies after generation retirement', async () => {
    let active = true
    const fixture = uiChannelFixture(() => active)
    onTestFinished(() => fixture.channel.close())
    const { root } = await configTestProject('export default { plugins: [] }')
    const context = await createContext({ root, mode: 'dev' })
    onTestFinished(async () => {
      await closeContext(context)
      await disposeConfigProjects()
    })
    registerMarketplaceChannels(context, fixture.channel, () => active)
    await fixture.request('histoire:ui:marketplace-catalog', { requestId: '' })
    expect(fixture.client.send).not.toHaveBeenCalled()
    active = false
    await fixture.request('histoire:ui:marketplace-catalog', { requestId: 'late' })
    expect(fixture.client.send).not.toHaveBeenCalled()
  })
})
