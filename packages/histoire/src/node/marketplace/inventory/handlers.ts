import type { Context } from '../../context.js'
import type { UiChannelServer } from '../../server/ui-channel/types.js'
import type { ReadUpdateVersions } from './updates.js'
import { correlationSchema, prefsSchema } from '../catalog/validation.js'
import { registerCorrelated } from '../channel.js'
import { createRegistryUpdateReader } from './registry-versions.js'
import { createUpdateService } from './updates.js'

/** Register generation-scoped updates through catalog's registry boundary. */
export function registerInventoryHandlers(ctx: Context, channel: UiChannelServer, isActive: () => boolean, readVersions?: ReadUpdateVersions): void {
  const service = createUpdateService(ctx, readVersions ?? createRegistryUpdateReader(ctx))
  registerCorrelated(channel, 'histoire:ui:marketplace-updates', 'histoire:ui:marketplace-updates-result', correlationSchema.extend({ prefs: prefsSchema }), async payload => ({ updates: await service.updates(payload.prefs) }), 'Could not check plugin updates', { isActive, invalidMessage: 'Invalid marketplace preferences' })
}
