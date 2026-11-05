import type { MarketplacePrefs } from '@histoire/shared'
import { describe, expect, it, onTestFinished } from 'vitest'
import { createMarketplaceClient } from '../../../../../histoire-app/src/app/util/marketplace-client.js'
import { marketplaceDefaults } from '../../../../../histoire-app/src/app/util/marketplace-preferences.js'
import { closeContext, createContext } from '../../context.js'
import { officialPlugins as official } from '../../marketplace/catalog/official.js'
import { registerMarketplaceChannels } from '../../marketplace/channel.js'
import { configTestProject, disposeConfigProjects } from '../utils/config-codemod.js'
import { createMarketplaceTransport } from '../utils/marketplace/transport.js'
import { uiChannelFixture } from '../utils/ui-channel.js'

/** Preferences belong to requests, never project files. */
const prefs: MarketplacePrefs = marketplaceDefaults()

describe('marketplace client', () => {
  it('correlates out-of-order replies and releases subscriptions', async () => {
    const channel = createMarketplaceTransport()
    const { sent } = channel
    const client = createMarketplaceClient({ transport: channel.transport })
    const first = client.updates(prefs)
    const second = client.updates(prefs)
    expect(sent.map(item => item.event)).toEqual(['histoire:ui:marketplace-updates', 'histoire:ui:marketplace-updates'])
    expect(sent[0].value.requestId).not.toBe(sent[1].value.requestId)
    channel.emit('histoire:ui:marketplace-updates-result', { requestId: sent[1].value.requestId, updates: [{ id: 'second', from: '1', to: '2', breaking: false }] })
    channel.emit('histoire:ui:marketplace-updates-result', { requestId: sent[0].value.requestId, updates: [] })
    expect(await first).toEqual([])
    expect(await second).toEqual([{ id: 'second', from: '1', to: '2', breaking: false }])
    expect(channel.listenerCount()).toBe(0)
    const detail = client.updateDetail(official[0].id, prefs)
    expect(sent[2]).toEqual({ event: 'histoire:ui:marketplace-update-detail', value: { requestId: expect.any(String), id: official[0].id, prefs } })
    channel.emit('histoire:ui:marketplace-update-detail-result', { requestId: sent[0].value.requestId, detail: official[1] })
    expect(channel.listenerCount()).toBe(1)
    channel.emit('histoire:ui:marketplace-update-detail-result', { requestId: sent[2].value.requestId, detail: official[0] })
    expect(await detail).toEqual(official[0])
    expect(channel.listenerCount()).toBe(0)
  })

  it('cleans up timed-out, aborted and failed sends without later traffic', async () => {
    const channel = createMarketplaceTransport()
    const client = createMarketplaceClient({ timeoutMs: 10, transport: channel.transport })
    await expect(client.updates(prefs)).rejects.toThrow('timed out')
    expect(channel.listenerCount()).toBe(0)
    const controller = new AbortController()
    const pending = client.updates(prefs, { signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await expect(client.updates(prefs, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(channel.sent).toHaveLength(2)
    expect(channel.listenerCount()).toBe(0)
    const broken = createMarketplaceClient({ transport: {
      ...channel.transport,
      send: () => { throw new Error('send failed') },
    } })
    await expect(broken.updates(prefs)).rejects.toThrow('send failed')
    expect(channel.listenerCount()).toBe(0)
  })

  it('serves bundled entries offline and produces manual plans without channel traffic', async () => {
    const client = createMarketplaceClient({ loadOfficial: async () => official, transport: {
      available: () => false,
      send: () => { throw new Error('Static workbench must not send') },
      on: () => { throw new Error('Static workbench must not subscribe') },
    } })
    const page = await client.catalog({ view: 'all', prefs })
    expect(page.entries).toHaveLength(10)
    expect(page.sources).toEqual({ official: 'ok', community: 'off' })
    expect((await client.detail('@histoire/plugin-a11y', prefs)).manifest.config.import).toBe('HstA11y')
    const plan = await client.plan({ kind: 'install', id: '@histoire/plugin-a11y', prefs })
    expect(plan.manual?.reason).toBe('static')
    expect(plan.manual?.steps.some(step => step.code?.includes('HstA11y'))).toBe(true)
    const pin = await client.plan({ kind: 'pin', id: '@histoire/plugin-a11y', version: '1.0.0', prefs })
    expect(pin.manual?.steps[0].code).toBe('npm install -D --save-exact @histoire/plugin-a11y@1.0.0')
    await expect(client.startJob('unused', 'unused')).rejects.toMatchObject({ code: 'unavailable' })
    await expect(client.updateDetail('@histoire/plugin-a11y', prefs)).rejects.toMatchObject({ code: 'unavailable' })
    expect(client.cancelJob('unused')).toBe(false)
    const off = client.subscribeJob(() => {
      throw new Error('No static job')
    })
    off()
  })

  it('consumes real server errors and observes jobs until subscription disposal', async () => {
    const fixture = uiChannelFixture()
    onTestFinished(() => fixture.channel.close())
    const { root } = await configTestProject('export default { plugins: [] }')
    const context = await createContext({ root, mode: 'build' })
    onTestFinished(async () => {
      await closeContext(context)
      await disposeConfigProjects()
    })
    registerMarketplaceChannels(context, fixture.channel, () => true)
    const channel = createMarketplaceTransport()
    fixture.client.send.mockImplementation((event, value) => {
      channel.emit(event, value)
    })
    const client = createMarketplaceClient({ transport: {
      ...channel.transport,
      send: (event, value) => {
        void fixture.request(event, value)
        return true
      },
    } })
    await expect(client.catalog({ view: 'all', prefs, limit: 61 })).rejects.toMatchObject({ code: 'invalid' })
    await expect(client.startJob('plan', 'hash')).rejects.toMatchObject({ code: 'invalid' })
    await expect(client.currentJob()).resolves.toBeNull()
    await expect(client.updateDetail('@histoire/plugin-a11y', prefs)).rejects.toMatchObject({ code: 'unavailable' })
    const jobs: string[] = []
    const off = client.subscribeJob(job => jobs.push(job.jobId))
    const job = { jobId: 'first', kind: 'install', id: '@histoire/plugin-a11y', version: '1.0.0', steps: [], output: [], status: 'running' }
    fixture.client.send('histoire:ui:marketplace-job-state', { job })
    expect(client.cancelJob(job.jobId)).toBe(true)
    expect(jobs).toEqual(['first'])
    off()
    fixture.client.send('histoire:ui:marketplace-job-state', { job: { ...job, jobId: 'second' } })
    expect(jobs).toEqual(['first'])
    expect(channel.listenerCount()).toBe(0)
  })
})
