import type { Context } from '../context.js'
import type { UiChannelServer } from '../server/ui-channel/types.js'
import { z } from 'zod'

/** Stable registration signature filled by each later service slice. */
export type MarketplaceRegistrar = (ctx: Context, channel: UiChannelServer, isActive: () => boolean) => void

/** Temporary reply shared by scaffolding, with bounded correlation and no project work. */
export function registerUnavailableHandler(channel: UiChannelServer, isActive: () => boolean, event: string, result: string, identity: 'requestId' | 'jobId' = 'requestId'): void {
  const schema = z.object({ [identity]: z.string().min(1).max(128) })
  channel.on(`histoire:ui:marketplace-${event}`, value => schema.parse(value), (payload, client) => {
    if (!isActive() || client.socket.readyState !== 1) return
    channel.send(`histoire:ui:marketplace-${result}`, {
      [identity]: payload[identity],
      error: { code: 'unavailable', message: 'Plugin marketplace is unavailable' },
    }, client)
  })
}
