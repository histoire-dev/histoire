import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { getPlanStore } from '../../marketplace/changes/handlers.js'
import { registerJobHandlers } from '../../marketplace/jobs/handlers.js'
import { readReceipt } from '../../marketplace/jobs/receipt.js'
import { disposeConfigProjects } from '../utils/config-codemod.js'
import { uiChannelFixture } from '../utils/ui-channel.js'
import { jobCoordinator, jobManifest, jobProject } from './jobs-fixture.js'

afterEach(disposeConfigProjects)

describe('marketplace job channel', () => {
  it('rejects invalid and stale requests privately without mutating a project', async () => {
    const fixture = await jobProject()
    const coordinator = await jobCoordinator(fixture.root)
    const channel = uiChannelFixture()
    try {
      const first = await coordinator.start()
      registerJobHandlers(first.context, channel.channel, () => true)
      await channel.request('histoire:ui:marketplace-job-start', { requestId: 'invalid', planId: '../escape', hash: '' })
      expect(channel.client.send).toHaveBeenLastCalledWith('histoire:ui:marketplace-job-state', { requestId: 'invalid', error: expect.objectContaining({ code: 'invalid' }) })
      await channel.request('histoire:ui:marketplace-job-start', { requestId: 'stale', planId: randomUUID(), hash: 'a'.repeat(64) })
      expect(channel.client.send).toHaveBeenLastCalledWith('histoire:ui:marketplace-job-state', { requestId: 'stale', error: expect.objectContaining({ code: 'stale' }) })
      expect(await readReceipt(fixture.root)).toBeUndefined()
      await channel.request('histoire:ui:marketplace-job-continue', { jobId: randomUUID() })
      expect(channel.client.send).toHaveBeenLastCalledWith('histoire:ui:marketplace-job-state', { jobId: expect.any(String), error: expect.objectContaining({ code: 'invalid' }) })
      expect(channel.ws.send).not.toHaveBeenCalled()
    }
    finally {
      await channel.channel.close()
      await coordinator.close()
    }
  })

  it('keeps accepted jobs running after client disconnection and returns current to reconnect', async () => {
    const fixture = await jobProject({}, 'ask')
    const coordinator = await jobCoordinator(fixture.root)
    const channel = uiChannelFixture()
    const originalPath = process.env.PATH
    try {
      process.env.PATH = fixture.env.PATH
      const first = await coordinator.start()
      const plans = getPlanStore(first.context, async () => ({ manifest: jobManifest, version: '1.2.3' }))
      const plan = await plans.plan(fixture.request)
      expect(first.context.configFile).toBeUndefined()
      expect(plan.manual).toBeUndefined()
      registerJobHandlers(first.context, channel.channel, () => true)
      await channel.request('histoire:ui:marketplace-job-start', { requestId: 'start', planId: plan.planId, hash: plan.hash })
      expect(channel.client.send).toHaveBeenLastCalledWith('histoire:ui:marketplace-job-state', { requestId: 'start', job: expect.objectContaining({ status: 'running' }) })
      channel.client.disconnect()
      await expect.poll(async () => (await readReceipt(fixture.root))?.job.awaiting).toBe('continue')
      const reconnected = channel.newClient()
      await channel.handlers.get('histoire:ui:marketplace-job-current')!({ requestId: 'reconnect' }, reconnected)
      expect(reconnected.send).toHaveBeenLastCalledWith('histoire:ui:marketplace-job-state', { requestId: 'reconnect', job: expect.objectContaining({ status: 'running', awaiting: 'continue' }) })
      await channel.handlers.get('histoire:ui:marketplace-job-continue')!({ jobId: (await readReceipt(fixture.root))!.job.jobId }, reconnected)
      await expect.poll(async () => (await readReceipt(fixture.root))?.handoff).toBe(true)
      await expect.poll(() => readFile(fixture.file, 'utf8')).toContain('TestPlugin()')
      const next = await coordinator.restart()
      const nextChannel = uiChannelFixture()
      try {
        registerJobHandlers(next.context, nextChannel.channel, () => true)
        await nextChannel.request('histoire:ui:marketplace-job-current', { requestId: 'loaded' })
        expect(nextChannel.client.send).toHaveBeenLastCalledWith('histoire:ui:marketplace-job-state', { requestId: 'loaded', job: expect.objectContaining({ status: 'succeeded', steps: expect.arrayContaining([{ id: 'load', state: 'done' }]) }) })
      }
      finally { await nextChannel.channel.close() }
    }
    finally {
      process.env.PATH = originalPath
      await channel.channel.close()
      await coordinator.close()
    }
  })
})
