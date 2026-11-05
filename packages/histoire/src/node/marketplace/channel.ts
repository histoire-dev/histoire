import type { Context } from '../context.js'
import type { UiChannelServer } from '../server/ui-channel/types.js'
import { z } from 'zod'
import { isUiChannelEventWithinBudget } from '../server/ui-channel/validation.js'
import { clearRegistryMemory } from './catalog/cache.js'
import { CatalogNotFoundError } from './catalog/errors.js'
import { registerCatalogHandlers } from './catalog/handlers.js'
import { correlationSchema } from './catalog/validation.js'
import { registerPlanHandlers } from './changes/handlers.js'
import { PlanningError } from './changes/plan-store.js'
import { registerInventoryHandlers } from './inventory/handlers.js'
import { registerJobHandlers } from './jobs/handlers.js'
import { JobError } from './jobs/types.js'
import { registerMigrationHandlers } from './migrations/handlers.js'

/** Stable registration signature for generation-owned marketplace services. */
export type MarketplaceRegistrar = (ctx: Context, channel: UiChannelServer, isActive: () => boolean) => void

/** Correlation and public validation details that differ between service events. */
interface CorrelatedOptions {
  /** Captured generation remains the only owner of replies. */ isActive: () => boolean
  /** Public validation failure for this operation. */ invalidMessage?: string
  /** Job actions use jobId only for failed replies. */ identity?: 'requestId' | 'jobId'
  /** Optional public error for oversized review output. */ capacityMessage?: string
}

/** Parse correlation first, then validate feature data and publish one bounded private reply. */
export function registerCorrelated<Schema extends z.ZodTypeAny>(channel: UiChannelServer, event: string, resultEvent: string, schema: Schema, run: (request: z.output<Schema>) => Promise<Record<string, unknown>>, fallbackMessage: string, options: CorrelatedOptions): void {
  const identity = options.identity ?? 'requestId'
  const envelope = identity === 'requestId' ? correlationSchema.passthrough() : z.object({ jobId: z.string().uuid() }).passthrough()
  channel.on(event, value => envelope.parse(value), async (input, client) => {
    /** Guard before starting work and after every asynchronous result. */
    const canReply = () => options.isActive() && client.socket.readyState === 1
    if (!canReply()) return
    const correlation = { [identity]: input[identity] }
    let reply: Record<string, unknown>
    try {
      const result = await run(schema.parse(input))
      reply = identity === 'requestId' ? { ...correlation, ...result } : result
      if (!isUiChannelEventWithinBudget(resultEvent, reply)) {
        if (options.capacityMessage) throw new PlanningError('failed', options.capacityMessage)
        throw new Error('Marketplace response exceeds channel capacity')
      }
    }
    catch (error) {
      const controlled = error instanceof CatalogNotFoundError || error instanceof PlanningError || error instanceof JobError
      reply = { ...correlation, error: {
        code: error instanceof z.ZodError ? 'invalid' : controlled ? error.code : 'failed',
        message: error instanceof z.ZodError ? options.invalidMessage ?? 'Invalid marketplace request' : controlled ? error.message : fallbackMessage,
      } }
    }
    if (canReply()) channel.send(resultEvent, reply, client)
  })
}

/** Attach marketplace services to the captured development generation only. */
export const registerMarketplaceChannels: MarketplaceRegistrar = (ctx, channel, isActive) => {
  channel.addCleanup(() => clearRegistryMemory(ctx.root))
  registerCatalogHandlers(ctx, channel, isActive)
  registerInventoryHandlers(ctx, channel, isActive)
  registerPlanHandlers(ctx, channel, isActive)
  registerJobHandlers(ctx, channel, isActive)
  registerMigrationHandlers(ctx, channel, isActive)
}
