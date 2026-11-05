import type { MarketplaceRegistrar } from '../channel-stub.js'
import { z } from 'zod'
import { isUiChannelEventWithinBudget } from '../../server/ui-channel/validation.js'
import { correlationSchema, packageName, prefsSchema } from '../catalog/validation.js'
import { PlanningError } from '../changes/planner.js'
import { updateDetails } from './details.js'

/** Slice-owned additive detail event uses existing correlation, bounds and PluginDetail DTO. */
export const registerMigrationHandlers: MarketplaceRegistrar = (ctx, channel, isActive) => {
  const schema = correlationSchema.extend({ id: packageName, prefs: prefsSchema }).strict()
  const event = 'histoire:ui:marketplace-update-detail-result'
  channel.on('histoire:ui:marketplace-update-detail', value => correlationSchema.passthrough().parse(value), async (input, client) => {
    if (!isActive() || client.socket.readyState !== 1) return
    let reply: Record<string, unknown>
    try {
      const request = schema.parse(input)
      if (!ctx.root || ctx.mode !== 'dev') throw new PlanningError('unavailable', 'Plugin updates require a development server')
      reply = { requestId: input.requestId, detail: await updateDetails(ctx, request.id, request.prefs) }
      if (!isUiChannelEventWithinBudget(event, reply)) throw new Error('Update metadata exceeds channel capacity')
    }
    catch (error) {
      reply = { requestId: input.requestId, error: {
        code: error instanceof z.ZodError ? 'invalid' : error instanceof PlanningError ? error.code : 'failed',
        message: error instanceof z.ZodError ? 'Invalid plugin update request' : error instanceof PlanningError ? error.message : 'Could not load plugin update',
      } }
    }
    if (isActive() && client.socket.readyState === 1) channel.send(event, reply, client)
  })
}
