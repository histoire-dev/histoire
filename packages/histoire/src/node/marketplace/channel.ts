import type { MarketplaceRegistrar } from './channel-stub.js'
import { clearRegistryMemory } from './catalog/cache.js'
import { registerCatalogHandlers } from './catalog/handlers.js'
import { registerPlanHandlers } from './changes/handlers.js'
import { registerInventoryHandlers } from './inventory/handlers.js'
import { registerJobHandlers } from './jobs/handlers.js'
import { registerMigrationHandlers } from './migrations/handlers.js'

/** Attach marketplace services to the captured development generation only. */
export const registerMarketplaceChannels: MarketplaceRegistrar = (ctx, channel, isActive) => {
  const root = ctx.root
  if (root) channel.addCleanup(() => clearRegistryMemory(root))
  registerCatalogHandlers(ctx, channel, isActive)
  registerInventoryHandlers(ctx, channel, isActive)
  registerPlanHandlers(ctx, channel, isActive)
  registerJobHandlers(ctx, channel, isActive)
  registerMigrationHandlers(ctx, channel, isActive)
}
