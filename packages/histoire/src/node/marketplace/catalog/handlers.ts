import type { MarketplaceRegistrar } from '../channel.js'
import { registerCorrelated } from '../channel.js'
import { getCatalogService } from './service.js'
import { catalogQuerySchema, correlationSchema, exactVersion, packageName, prefsSchema } from './validation.js'

/** Register private correlated reads; retired generations and closed clients cannot reply. */
export const registerCatalogHandlers: MarketplaceRegistrar = (ctx, channel, isActive) => {
  const service = getCatalogService(ctx)
  registerCorrelated(channel, 'histoire:ui:marketplace-catalog', 'histoire:ui:marketplace-catalog-result', correlationSchema.extend({ query: catalogQuerySchema }), async request => ({ page: await service.catalog(request.query) }), 'Could not load plugin catalog', { isActive })
  registerCorrelated(channel, 'histoire:ui:marketplace-detail', 'histoire:ui:marketplace-detail-result', correlationSchema.extend({ id: packageName, prefs: prefsSchema, version: exactVersion.optional() }), async request => ({ detail: await service.detail(request.id, request.prefs, request.version) }), 'Could not load plugin catalog', { isActive })
}
