import type { MarketplaceRegistrar } from '../channel.js'
import { correlationSchema, packageName, prefsSchema } from '../catalog/validation.js'
import { PlanningError } from '../changes/planner.js'
import { registerCorrelated } from '../channel.js'
import { updateDetails } from './details.js'

/** Additive detail event uses existing correlation, bounds and PluginDetail DTO. */
export const registerMigrationHandlers: MarketplaceRegistrar = (ctx, channel, isActive) => {
  const schema = correlationSchema.extend({ id: packageName, prefs: prefsSchema }).strict()
  registerCorrelated(channel, 'histoire:ui:marketplace-update-detail', 'histoire:ui:marketplace-update-detail-result', schema, async (request) => {
    if (ctx.mode !== 'dev') throw new PlanningError('unavailable', 'Plugin updates require a development server')
    return { detail: await updateDetails(ctx, request.id, request.prefs) }
  }, 'Could not load plugin update', { isActive, invalidMessage: 'Invalid plugin update request' })
}
