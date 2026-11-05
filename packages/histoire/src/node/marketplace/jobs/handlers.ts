import type { Context } from '../../context.js'
import type { MarketplaceRegistrar } from '../channel.js'
import { z } from 'zod'
import { getHostRestart } from '../../runtime/host-restart.js'
import { correlationSchema } from '../catalog/validation.js'
import { getPlanStore } from '../changes/handlers.js'
import { registerCorrelated } from '../channel.js'
import { createJobRunner } from './runner.js'
import { JobError } from './types.js'

/** One engine per loaded context, shared by every connected client. */
const runners = new WeakMap<Context, ReturnType<typeof createJobRunner>>()
/** Validates bounded reviewed capabilities after preserving request correlation. */
const startSchema = z.object({ requestId: z.string().min(1).max(128), planId: z.string().uuid(), hash: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
/** Only a server-issued job identity is accepted for cancellation or continuation. */
const cancelSchema = z.object({ jobId: z.string().uuid() }).strict()

/** Registers correlated admission/current/cancel/continue and generation-scoped broadcast observers. */
export const registerJobHandlers: MarketplaceRegistrar = (ctx, channel, isActive) => {
  const file = ctx.pluginToggle?.file ?? ctx.configFile
  const runner = file && ctx.mode === 'dev'
    ? runners.get(ctx) ?? createJobRunner({ root: ctx.root, configFile: file, plans: getPlanStore(ctx), context: ctx, restart: getHostRestart() })
    : undefined
  if (runner) runners.set(ctx, runner)
  const off = runner?.subscribe((job) => {
    if (isActive()) channel.send('histoire:ui:marketplace-job-state', { job })
  })
  // Disconnection and generation retirement release observers, never process ownership.
  channel.addCleanup(() => off?.())
  const resultEvent = 'histoire:ui:marketplace-job-state'
  const fallback = 'Could not process plugin job'
  const correlatedOptions = { isActive, invalidMessage: 'Invalid plugin job request' }
  registerCorrelated(channel, 'histoire:ui:marketplace-job-start', resultEvent, startSchema, async (request) => {
    if (!runner) throw new JobError('unavailable', 'Plugin jobs are unavailable')
    return { job: await runner.start(request.planId, request.hash) }
  }, fallback, correlatedOptions)
  registerCorrelated(channel, 'histoire:ui:marketplace-job-current', resultEvent, correlationSchema, async () => ({ job: await runner?.current() ?? null }), fallback, correlatedOptions)
  for (const action of ['cancel', 'continue'] as const) {
    registerCorrelated(channel, `histoire:ui:marketplace-job-${action}`, resultEvent, cancelSchema, async ({ jobId }) => {
      if (!runner) throw new JobError('unavailable', 'Plugin jobs are unavailable')
      await runner[action](jobId)
      return { job: await runner.current() }
    }, fallback, { ...correlatedOptions, identity: 'jobId' })
  }
  channel.onReady(async (client) => {
    const job = await runner?.current()
    if (job && isActive() && client.socket.readyState === 1) channel.send('histoire:ui:marketplace-job-state', { job }, client)
  })
}
