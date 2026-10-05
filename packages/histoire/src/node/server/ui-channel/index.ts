import type { ViteDevServer } from 'vite'
import type { Context } from '../../context.js'
import type { ExecutionService } from '../../runtime/execution-service.js'
import type { UiChannelServer } from './types.js'
import { getContextRegistry } from '../../runtime/registry.js'
import { createUiChannel } from './channel.js'
import { registerMcpChannel } from './mcp.js'
import { registerScreenshotChannel } from './screenshot.js'

/** Generation-scoped integration point for config, comments, and ACP features. */
const channels = new WeakMap<Context, UiChannelServer>()

/** Install dev-only handlers once on the generation's existing Vite socket. */
export function registerUiChannel(ctx: Context, server: ViteDevServer, execution: ExecutionService, isActive: () => boolean): UiChannelServer {
  const existing = channels.get(ctx)
  if (existing) return existing
  const channel = createUiChannel(server, isActive)
  channels.set(ctx, channel)
  getContextRegistry(ctx).cleanup.add(async () => {
    channels.delete(ctx)
    await channel.close()
  })
  registerScreenshotChannel(ctx, server, channel, execution, isActive)
  registerMcpChannel(ctx, channel)
  return channel
}

/** Additional dev slices attach handlers to this exact generation's channel. */
export function getUiChannel(ctx: Context): UiChannelServer | undefined {
  return channels.get(ctx)
}

export type { UiChannelClient, UiChannelServer } from './types.js'
