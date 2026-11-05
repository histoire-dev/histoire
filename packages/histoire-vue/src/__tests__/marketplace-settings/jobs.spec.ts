import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushMicrotasks } from '../../../../histoire/src/node/__tests__/utils/flush.js'
import { stubMarketplaceSession } from '../utils/marketplace-transport.js'
import { settingsFixture } from './fixture.js'

vi.mock('virtual:$histoire-config', async () => ({ config: { theme: {} }, logos: {}, installedPlugins: (await import('./data.js')).plugins }))

beforeEach(stubMarketplaceSession)

const cleanups: (() => unknown)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  sessionStorage.removeItem('_histoire-settings-job:/')
})

it('updates every safe package sequentially after load, deferring breaking releases', async () => {
  const f = await settingsFixture()
  cleanups.push(f.dispose)
  await f.replyUpdates()
  await f.button('Update all').trigger('click')
  await flushMicrotasks(10)
  expect(f.store.updateTarget.value).toBe('@histoire/plugin-vue')
  expect(f.request('plan').request).toMatchObject({ kind: 'update', id: '@histoire/plugin-a11y', version: '1.1.1' })
  await f.replyPlan()
  await f.job()
  expect(f.wrapper.get('[role="status"]').text()).toContain('Installing package')
  expect(f.channel.sent.filter(item => item.event === 'histoire:ui:marketplace-plan' && item.value.request.kind === 'update')).toHaveLength(1)
  await f.job({ status: 'succeeded', steps: [{ id: 'load', state: 'done' }] }, false)
  expect(f.channel.sent.filter(item => item.event === 'histoire:ui:marketplace-plan' && item.value.request.kind === 'update')).toHaveLength(2)
  expect(f.request('plan').request).toMatchObject({ kind: 'update', id: '@histoire/plugin-designs', version: '1.2.1' })
  await f.replyPlan()
  await f.job({ jobId: 'second', id: '@histoire/plugin-designs', version: '1.2.1' })
  await f.job({ jobId: 'second', id: '@histoire/plugin-designs', version: '1.2.1', status: 'succeeded' }, false)
  // Duplicate terminal broadcasts must not start another queue member.
  await f.job({ jobId: 'second', id: '@histoire/plugin-designs', version: '1.2.1', status: 'succeeded' }, false)
  expect(f.channel.sent.filter(item => item.event === 'histoire:ui:marketplace-plan' && item.value.request.kind === 'update')).toHaveLength(2)
  expect(f.wrapper.text()).not.toContain('Update to 1.2.1')
})

it('stops queue on failure and opens wizard with failed receipt intact', async () => {
  const f = await settingsFixture()
  cleanups.push(f.dispose)
  await f.replyUpdates()
  await f.button('Update all').trigger('click')
  await flushMicrotasks(10)
  await f.replyPlan()
  await f.job()
  await f.job({ status: 'failed', failure: { code: 'network', message: 'Registry offline', restored: true, leftovers: [] } }, false)
  expect(f.channel.sent.filter(item => item.event === 'histoire:ui:marketplace-plan' && item.value.request.kind === 'update')).toHaveLength(1)
  expect(f.store.open.value).toBe(true)
  expect(f.store.view.value).toBe('install')
  expect(f.store.job.value?.failure?.message).toBe('Registry offline')
  expect(f.wrapper.findAll('[role="alert"]').some(item => item.text() === 'Registry offline')).toBe(true)
})

it('shows a manual restart without browser requests when the server has no restart host', async () => {
  const f = await settingsFixture()
  cleanups.push(f.dispose)
  const network = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 202 }))
  await f.replyUpdates()
  await f.button('Update all').trigger('click')
  await flushMicrotasks(10)
  await f.replyPlan()
  await f.job({ awaiting: 'restart' })
  await f.job({ awaiting: 'restart' }, false)
  expect(f.wrapper.text()).toContain('Restart the dev server to finish')
  expect(f.wrapper.findAll('button').some(item => item.text() === 'Restart now')).toBe(false)
  expect(network).not.toHaveBeenCalled()
  expect(f.channel.sent.filter(item => item.event === 'histoire:ui:marketplace-plan' && item.value.request.kind === 'update')).toHaveLength(1)
})

it('uses manual flow when planner refuses writes and never starts a job', async () => {
  const f = await settingsFixture()
  cleanups.push(f.dispose)
  await f.replyUpdates()
  await f.button('Update all').trigger('click')
  await flushMicrotasks(10)
  await f.replyPlan(true)
  expect(f.store.view.value).toBe('manual')
  expect(f.store.manualPlan.value?.manual?.reason).toBe('config-not-literal')
  expect(f.channel.sent.some(item => item.event === 'histoire:ui:marketplace-job-start')).toBe(false)
})

it('continues a held ask-mode job once without browser restart requests', async () => {
  const f = await settingsFixture()
  cleanups.push(f.dispose)
  const network = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 202 }))
  f.store.prefs.value.afterInstall = 'ask'
  await f.replyUpdates()
  await f.button('Update all').trigger('click')
  await flushMicrotasks(10)
  await f.replyPlan()
  await f.job({ awaiting: 'continue' })
  expect(network).not.toHaveBeenCalled()
  await f.button('Restart now').trigger('click')
  expect(f.request('job-continue')).toEqual({ jobId: 'first' })
  expect(f.channel.sent.filter(item => item.event === 'histoire:ui:marketplace-job-continue')).toHaveLength(1)
  expect(network).not.toHaveBeenCalled()
})

it('recovers settings receipt and remaining queue after a page reload', async () => {
  const first = await settingsFixture()
  cleanups.push(first.dispose)
  await first.replyUpdates()
  await first.button('Update all').trigger('click')
  await flushMicrotasks(10)
  await first.replyPlan()
  await first.job()
  await first.dispose()
  const next = await settingsFixture()
  cleanups.push(next.dispose)
  await next.job({ status: 'succeeded' }, false)
  expect(next.request('plan').request).toMatchObject({ kind: 'update', id: '@histoire/plugin-designs', version: '1.2.1' })
  expect(next.channel.sent.filter(item => item.event === 'histoire:ui:marketplace-plan' && item.value.request.kind === 'update')).toHaveLength(1)
})

it('releases a held plan on unmount without starting a late job or cancelling server work', async () => {
  const f = await settingsFixture()
  cleanups.push(f.dispose)
  await f.replyUpdates()
  await f.button('Update all').trigger('click')
  await flushMicrotasks(10)
  await f.dispose()
  expect(f.channel.listenerCount()).toBe(0)
  await f.replyPlan()
  expect(f.channel.sent.some(item => item.event === 'histoire:ui:marketplace-job-start' || item.event === 'histoire:ui:marketplace-job-cancel')).toBe(false)
})
