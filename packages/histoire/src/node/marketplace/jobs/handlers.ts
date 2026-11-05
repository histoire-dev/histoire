import type { MarketplaceError } from '@histoire/shared'
import type { Context } from '../../context.js'
import type { MarketplaceRegistrar } from '../channel-stub.js'
import { z, ZodError } from 'zod'
import { getHostRestart } from '../../runtime/host-restart.js'
import { correlationSchema } from '../catalog/validation.js'
import { getPlanStore } from '../changes/handlers.js'
import { PlanningError } from '../changes/planner.js'
import { createJobRunner } from './runner.js'
import { JobError } from './types.js'

/** One engine per loaded context, shared by every connected client. */
const runners = new WeakMap<Context, ReturnType<typeof createJobRunner>>()
/** Validates bounded reviewed capabilities after preserving request correlation. */
const startSchema = z.object({ requestId: z.string().min(1).max(128), planId: z.string().uuid(), hash: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
/** Only a server-issued job identity is accepted for cancellation or continuation. */
const cancelSchema = z.object({ jobId: z.string().uuid() }).strict()

/** Maps controlled admission failures to bounded private channel replies. */
function failure(error: unknown): MarketplaceError {
  if (error instanceof JobError || error instanceof PlanningError) return { code: error.code, message: error.message }
  return { code: error instanceof ZodError ? 'invalid' : 'failed', message: error instanceof ZodError ? 'Invalid plugin job request' : 'Could not process plugin job' }
}

/** Registers correlated admission/current/cancel/continue and generation-scoped broadcast observers. */
export const registerJobHandlers: MarketplaceRegistrar = (ctx, channel, isActive) => {
  const file = ctx.pluginToggle?.file ?? ctx.configFile
  const runner = ctx.root && file && ctx.mode === 'dev'
    ? runners.get(ctx) ?? createJobRunner({ root: ctx.root, configFile: file, plans: getPlanStore(ctx), context: ctx, restart: getHostRestart() })
    : undefined
  if (runner) runners.set(ctx, runner)
  const off = runner?.subscribe((job) => {
    if (isActive()) channel.send('histoire:ui:marketplace-job-state', { job })
  })
  // Disconnection and generation retirement release observers, never process ownership.
  channel.addCleanup(() => off?.())
  channel.on('histoire:ui:marketplace-job-start', (value) => {
    correlationSchema.parse(value)
    return value
  }, async (value, client) => {
    const { requestId } = correlationSchema.parse(value)
    try {
      const request = startSchema.parse(value)
      if (!runner) throw new JobError('unavailable', 'Plugin jobs are unavailable')
      const job = await runner.start(request.planId, request.hash)
      if (isActive() && client.socket.readyState === 1) channel.send('histoire:ui:marketplace-job-state', { requestId, job }, client)
    }
    catch (error) {
      if (isActive() && client.socket.readyState === 1) channel.send('histoire:ui:marketplace-job-state', { requestId, error: failure(error) }, client)
    }
  })
  channel.on('histoire:ui:marketplace-job-current', value => correlationSchema.parse(value), async ({ requestId }, client) => {
    try {
      const job = await runner?.current() ?? null
      if (isActive() && client.socket.readyState === 1) channel.send('histoire:ui:marketplace-job-state', { requestId, job }, client)
    }
    catch (error) {
      if (isActive() && client.socket.readyState === 1) channel.send('histoire:ui:marketplace-job-state', { requestId, error: failure(error) }, client)
    }
  })
  for (const action of ['cancel', 'continue'] as const) {
    channel.on(`histoire:ui:marketplace-job-${action}`, value => cancelSchema.parse(value), async ({ jobId }, client) => {
      try {
        if (!runner) throw new JobError('unavailable', 'Plugin jobs are unavailable')
        await runner[action](jobId)
        const job = await runner.current()
        if (isActive() && client.socket.readyState === 1) channel.send('histoire:ui:marketplace-job-state', { job }, client)
      }
      catch (error) {
        if (isActive() && client.socket.readyState === 1) channel.send('histoire:ui:marketplace-job-state', { jobId, error: failure(error) }, client)
      }
    })
  }
  channel.onReady(async (client) => {
    const job = await runner?.current()
    if (job && isActive() && client.socket.readyState === 1) channel.send('histoire:ui:marketplace-job-state', { job }, client)
  })
}
