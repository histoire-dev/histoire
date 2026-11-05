import type { MarketplacePrefs } from '@histoire/shared'
import type { Context } from '../../context.js'
import type { UiChannelServer } from '../../server/ui-channel/types.js'
import type { ReadUpdateVersions } from './updates.js'
import { z } from 'zod'
import { correlationSchema, prefsSchema } from '../catalog/validation.js'
import { registerUnavailableHandler } from '../channel-stub.js'
import { createRegistryUpdateReader } from './registry-versions.js'
import { createUpdateService } from './updates.js'

/** Register generation-scoped updates through catalog's registry boundary. */
export function registerInventoryHandlers(ctx: Context, channel: UiChannelServer, isActive: () => boolean, readVersions?: ReadUpdateVersions): void {
  if (!readVersions && (!ctx.root || !ctx.config)) {
    registerUnavailableHandler(channel, isActive, 'updates', 'updates-result')
    return
  }
  const service = createUpdateService(ctx, readVersions ?? createRegistryUpdateReader(ctx))
  const request = correlationSchema.extend({ prefs: z.unknown() })
  channel.on('histoire:ui:marketplace-updates', value => request.parse(value), async (payload, client) => {
    /** A retired generation or disconnected requester must not receive late work. */
    const canReply = () => isActive() && client.socket.readyState === 1
    if (!canReply()) return
    const parsed = prefsSchema.safeParse(payload.prefs)
    if (!parsed.success) {
      channel.send('histoire:ui:marketplace-updates-result', { requestId: payload.requestId, error: { code: 'invalid', message: 'Invalid marketplace preferences' } }, client)
      return
    }
    try {
      const updates = await service.updates(parsed.data as MarketplacePrefs)
      if (canReply()) channel.send('histoire:ui:marketplace-updates-result', { requestId: payload.requestId, updates }, client)
    }
    catch {
      if (canReply()) channel.send('histoire:ui:marketplace-updates-result', { requestId: payload.requestId, error: { code: 'failed', message: 'Could not check plugin updates' } }, client)
    }
  })
}
