import type { Context } from '../../context.js'
import type { MarketplaceRegistrar } from '../channel.js'
import type { PlannerOptions } from './planner.js'
import { getConfigDependencies } from '../../config/dependencies.js'
import { registerCorrelated } from '../channel.js'
import { withMigrations } from '../migrations/plan.js'
import { createPlanStore } from './plan-store.js'
import { projectPluginResolver } from './resolve-plugin.js'
import { changeRequestSchema, planEnvelope } from './validation.js'

/** Generation-local review stores shared with job admission in slice 06. */
const stores = new WeakMap<Context, ReturnType<typeof createPlanStore>>()

/** Retrieves one generation's planner; target resolvers must remain read-only. */
export function getPlanStore(ctx: Context, resolvePlugin: PlannerOptions['resolvePlugin'] = projectPluginResolver(ctx)) {
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
  const store = getPlanStore(ctx)
  channel.addCleanup(() => store.clear())
  registerCorrelated(channel, 'histoire:ui:marketplace-plan', 'histoire:ui:marketplace-plan-result', planEnvelope.extend({ request: changeRequestSchema }), async payload => ({ plan: await store.plan(payload.request) }), 'Could not plan plugin changes', { isActive, invalidMessage: 'Invalid plugin change', capacityMessage: 'Plugin changes exceed channel capacity' })
}
