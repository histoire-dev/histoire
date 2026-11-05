import type { Context } from '../../context.js'
import type { MarketplaceRegistrar } from '../channel-stub.js'
import type { PlannerOptions } from './planner.js'
import { ZodError } from 'zod'
import { getConfigDependencies } from '../../config/dependencies.js'
import { isUiChannelEventWithinBudget } from '../../server/ui-channel/validation.js'
import { withMigrations } from '../migrations/plan.js'
import { createPlanStore, PlanningError } from './plan-store.js'
import { projectPluginResolver } from './resolve-plugin.js'
import { changeRequestSchema, planEnvelope } from './validation.js'

/** Generation-local review stores shared with job admission in slice 06. */
const stores = new WeakMap<Context, ReturnType<typeof createPlanStore>>()

/** Retrieves one generation's planner; target resolvers must remain read-only. */
export function getPlanStore(ctx: Context, resolvePlugin: PlannerOptions['resolvePlugin'] = projectPluginResolver(ctx.root)) {
  let store = stores.get(ctx)
  if (!store) {
    const options: PlannerOptions = {
      root: ctx.root,
      configFile: ctx.pluginToggle?.file ?? ctx.configFile,
      static: ctx.mode !== 'dev',
      resolvePlugin,
      /** Loader inputs include Vite and transitive modules; planner also follows native imports. */
      configDependencies() {
        const dependencies = getConfigDependencies(ctx.config)
        return [...dependencies?.histoire.keys() ?? [], ...dependencies?.vite.keys() ?? []]
      },
    }
    store = withMigrations(ctx, createPlanStore(options), options)
    stores.set(ctx, store)
  }
  return store
}

/** Registers private correlated plans and retires their capabilities on cleanup. */
export const registerPlanHandlers: MarketplaceRegistrar = (ctx, channel, isActive) => {
  const store = ctx.root ? getPlanStore(ctx) : undefined
  channel.addCleanup(() => store?.clear())
  channel.on('histoire:ui:marketplace-plan', value => planEnvelope.parse(value), async (payload, client) => {
    /** Async metadata or disk reads must never publish into a retired runtime. */
    const canReply = () => isActive() && client.socket.readyState === 1
    if (!canReply()) return
    if (!store) {
      channel.send('histoire:ui:marketplace-plan-result', { requestId: payload.requestId, error: { code: 'unavailable', message: 'Plugin marketplace is unavailable' } }, client)
      return
    }
    try {
      // Keep the envelope separate: malformed intents retain their correlation.
      const request = changeRequestSchema.parse(payload.request)
      const plan = await store.plan(request)
      if (!isUiChannelEventWithinBudget('histoire:ui:marketplace-plan-result', { requestId: payload.requestId, plan })) throw new PlanningError('failed', 'Plugin changes exceed channel capacity')
      if (canReply()) channel.send('histoire:ui:marketplace-plan-result', { requestId: payload.requestId, plan }, client)
    }
    catch (error) {
      if (!canReply()) return
      const code = error instanceof PlanningError ? error.code : error instanceof ZodError ? 'invalid' : 'failed'
      channel.send('histoire:ui:marketplace-plan-result', { requestId: payload.requestId, error: { code, message: error instanceof PlanningError ? error.message : code === 'invalid' ? 'Invalid plugin change' : 'Could not plan plugin changes' } }, client)
    }
  })
}
