import type { MarketplacePrefs, PluginDetail } from '@histoire/shared'
import type { Context } from '../../context.js'
import { describe, expect, it, onTestFinished } from 'vitest'
import { createMarketplaceClient } from '../../../../../histoire-app/src/app/util/marketplace-client.js'
import official from '../../marketplace/catalog/official.json'
import { registerMarketplaceChannels } from '../../marketplace/channel.js'
import { uiChannelFixture } from '../utils/ui-channel.js'

/** Preferences belong to requests, never project files. */
const prefs: MarketplacePrefs = { community: false, packageManager: 'auto', afterInstall: 'restart', skippedVersions: {} }

describe('marketplace client', () => {
  it('correlates out-of-order replies and releases subscriptions', async () => {
    const listeners = new Map<string, Set<(value: any) => void>>()
    const sent: Array<{ event: string, value: any }> = []
    const client = createMarketplaceClient({ transport: {
      available: () => true,
      send: (event, value) => {
        sent.push({ event, value })
        return true
      },
      on: (event, listener) => {
        const set = listeners.get(event) ?? new Set()
        listeners.set(event, set)
        set.add(listener)
        return () => set.delete(listener)
      },
    } })
    const first = client.updates(prefs)
    const second = client.updates(prefs)
    expect(sent.map(item => item.event)).toEqual(['histoire:ui:marketplace-updates', 'histoire:ui:marketplace-updates'])
    expect(sent[0].value.requestId).not.toBe(sent[1].value.requestId)
    for (const listener of [...listeners.get('histoire:ui:marketplace-updates-result')!]) listener({ requestId: sent[1].value.requestId, updates: [{ id: 'second', from: '1', to: '2', breaking: false }] })
    for (const listener of [...listeners.get('histoire:ui:marketplace-updates-result')!]) listener({ requestId: sent[0].value.requestId, updates: [] })
    expect(await first).toEqual([])
    expect(await second).toEqual([{ id: 'second', from: '1', to: '2', breaking: false }])
    expect(listeners.get('histoire:ui:marketplace-updates-result')!.size).toBe(0)
    const detail = client.updateDetail(official[0].id, prefs)
    expect(sent[2]).toEqual({ event: 'histoire:ui:marketplace-update-detail', value: { requestId: expect.any(String), id: official[0].id, prefs } })
    for (const listener of [...listeners.get('histoire:ui:marketplace-update-detail-result')!]) listener({ requestId: sent[0].value.requestId, detail: official[1] })
    expect(listeners.get('histoire:ui:marketplace-update-detail-result')!.size).toBe(1)
    for (const listener of [...listeners.get('histoire:ui:marketplace-update-detail-result')!]) listener({ requestId: sent[2].value.requestId, detail: official[0] })
    expect(await detail).toEqual(official[0])
    expect(listeners.get('histoire:ui:marketplace-update-detail-result')!.size).toBe(0)
  })

  it('cleans up timed-out, aborted and failed sends without later traffic', async () => {
    const listeners = new Set<unknown>()
    const sent: string[] = []
    const client = createMarketplaceClient({ timeoutMs: 10, transport: {
      available: () => true,
      send: (event) => {
        sent.push(event)
        return true
      },
      on: (_, listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    } })
    await expect(client.updates(prefs)).rejects.toThrow('timed out')
    expect(listeners.size).toBe(0)
    const controller = new AbortController()
    const pending = client.updates(prefs, { signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await expect(client.updates(prefs, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(sent).toHaveLength(2)
    expect(listeners.size).toBe(0)
    const broken = createMarketplaceClient({ transport: {
      available: () => true,
      send: () => { throw new Error('send failed') },
      on: (_, listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    } })
    await expect(broken.updates(prefs)).rejects.toThrow('send failed')
    expect(listeners.size).toBe(0)
  })

  it('serves bundled entries offline and produces manual plans without channel traffic', async () => {
    const client = createMarketplaceClient({ loadOfficial: async () => official as PluginDetail[], transport: {
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
    const nested = await client.plan({ kind: 'options', id: '@histoire/plugin-a11y', prefs, options: { 'test.minimumImpact': 'serious' } })
    expect(nested.manual?.steps.find(step => step.title === 'Update histoire.config.ts')?.code).toContain('"test": {')
    expect(nested.manual?.steps.find(step => step.title === 'Update histoire.config.ts')?.code).not.toContain('test.minimumImpact')
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

  it('honors offline search, filters and pagination while preserving bundled data', async () => {
    const before = structuredClone(official)
    const client = createMarketplaceClient({ loadOfficial: async () => official as PluginDetail[], transport: {
      available: () => false,
      send: () => false,
      on: () => () => {},
    } })
    const first = await client.catalog({ view: 'all', prefs, filters: { category: 'testing' }, sort: 'name', limit: 2 })
    expect(first.entries.map(entry => entry.id)).toEqual(['@histoire/plugin-a11y', '@histoire/plugin-percy'])
    expect(first.total).toBe(3)
    expect(first.facets.category.testing).toBe(3)
    expect(first.facets.category.frameworks).toBe(5)
    const second = await client.catalog({ view: 'all', prefs, filters: { category: 'testing' }, sort: 'name', limit: 2, cursor: first.cursor })
    expect(second.entries.map(entry => entry.id)).toEqual(['@histoire/plugin-screenshot'])
    expect(second.cursor).toBeUndefined()
    first.entries[0].displayName = 'Changed by consumer'
    expect(official).toEqual(before)
    expect((await client.catalog({ view: 'all', prefs, query: 'Figma' })).entries.map(entry => entry.id)).toEqual(['@histoire/plugin-designs'])
    expect((await client.catalog({ view: 'all', prefs, filters: { adds: ['canvas-view'] } })).entries.map(entry => entry.id)).toEqual(['@histoire/plugin-designs'])
  })

  it('consumes real server errors and observes jobs until subscription disposal', async () => {
    const fixture = uiChannelFixture()
    onTestFinished(() => fixture.channel.close())
    registerMarketplaceChannels({} as Context, fixture.channel, () => true)
    const listeners = new Map<string, Set<(value: any) => void>>()
    fixture.client.send.mockImplementation((event, value) => {
      for (const listener of listeners.get(event) ?? []) listener(value)
    })
    const client = createMarketplaceClient({ transport: {
      available: () => true,
      send: (event, value) => {
        void fixture.request(event, value)
        return true
      },
      on: (event, listener) => {
        const set = listeners.get(event) ?? new Set()
        listeners.set(event, set)
        set.add(listener)
        return () => set.delete(listener)
      },
    } })
    await expect(client.catalog({ view: 'all', prefs })).rejects.toMatchObject({ code: 'unavailable' })
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
    expect([...listeners.values()].every(set => set.size === 0)).toBe(true)
  })
})
