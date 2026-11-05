import type { MarketplaceRegistrar } from '../channel-stub.js'
import { z } from 'zod'
import { isUiChannelEventWithinBudget } from '../../server/ui-channel/validation.js'
import { registerUnavailableHandler } from '../channel-stub.js'
import { CatalogNotFoundError } from './errors.js'
import { getCatalogService } from './service.js'
import { catalogQuerySchema, correlationSchema, packageName, prefsSchema } from './validation.js'

/** Register private correlated reads; retired generations and closed clients cannot reply. */
export const registerCatalogHandlers: MarketplaceRegistrar = (ctx, channel, isActive) => {
  if (!ctx.root) {
    registerUnavailableHandler(channel, isActive, 'catalog', 'catalog-result')
    registerUnavailableHandler(channel, isActive, 'detail', 'detail-result')
    return
  }
  const service = getCatalogService(ctx)
  const schemas = {
    catalog: correlationSchema.extend({ query: catalogQuerySchema }),
    detail: correlationSchema.extend({ id: packageName, prefs: prefsSchema }),
  }
  for (const kind of ['catalog', 'detail'] as const) {
    channel.on(`histoire:ui:marketplace-${kind}`, value => correlationSchema.passthrough().parse(value), async (input, client) => {
      const event = `histoire:ui:marketplace-${kind}-result`
      let reply: Record<string, unknown>
      try {
        if (kind === 'catalog') {
          const request = schemas.catalog.parse(input)
          reply = { requestId: input.requestId, page: await service.catalog(request.query) }
        }
        else {
          const request = schemas.detail.parse(input)
          reply = { requestId: input.requestId, detail: await service.detail(request.id, request.prefs) }
        }
        if (!isUiChannelEventWithinBudget(event, reply)) throw new Error('Catalog response exceeds channel capacity')
      }
      catch (error) {
        reply = { requestId: input.requestId, error: {
          code: error instanceof z.ZodError ? 'invalid' : error instanceof CatalogNotFoundError ? error.code : 'failed',
          message: error instanceof z.ZodError ? 'Invalid marketplace request' : error instanceof CatalogNotFoundError ? error.message : 'Could not load plugin catalog',
        } }
      }
      if (isActive() && client.socket.readyState === 1) channel.send(event, reply, client)
    })
  }
}
