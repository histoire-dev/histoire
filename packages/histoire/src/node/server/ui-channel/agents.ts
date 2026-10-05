import type { ViteDevServer } from 'vite'
import type { Context } from '../../context.js'
import type { UiChannelClient, UiChannelServer } from './types.js'
import { z } from 'zod'
import { getAcpManager } from '../../acp/index.js'
import { validateAgentSettings } from '../../acp/validation.js'
import { registerAgentEnvironment } from './agents-env.js'
import { onVerifiedConfigSave } from './config-receipts.js'

/** Adds lazy agent settings/status and permission handling to this dev generation. */
export function registerAgentsChannel(ctx: Context, channel: UiChannelServer, server?: ViteDevServer) {
  const manager = getAcpManager(ctx)
  let active = true
  channel.addCleanup(onVerifiedConfigSave(ctx, (paths, config) => manager.retireProjectOverrides(paths, config)))
  /** Replies contain only validated preferences and redacted runtime projections. */
  function snapshot(client?: UiChannelClient, error?: string): void {
    if (active) channel.send('histoire:ui:agents-snapshot', { ...manager.snapshot(), ...error ? { error } : {} }, client)
  }
  channel.addCleanup(manager.onUpdate((event) => {
    if (!active) return
    const events = { 'snapshot': 'agents-snapshot', 'permission': 'agent-permission', 'permission-resolved': 'agent-permission-resolved', 'reply': 'agent-reply' }
    channel.send(`histoire:ui:${events[event.type]}`, event.value)
  }))
  channel.onReady((client) => {
    void manager.ready.then(() => snapshot(client)).catch(() => snapshot(client, 'Cannot load agent user settings; repair agents.json'))
  })
  channel.on('histoire:ui:agents-configure', validateAgentSettings, async (settings, client) => {
    try {
      await manager.configure(settings)
      snapshot(client)
    }
    catch { snapshot(client, 'Cannot save agent preferences; check user settings directory') }
  })
  channel.on('histoire:ui:agents-reset-project', value => z.object({ paths: z.array(z.enum(['agents.presets', 'agents.permissions'])).min(1).max(2) }).strict().parse(value), async ({ paths }, client) => {
    try {
      await manager.resetProjectOverrides(paths)
      snapshot(client)
    }
    catch { snapshot(client, 'Cannot reset agent project preferences; check user settings directory') }
  })
  channel.on('histoire:ui:agent-restart', value => z.object({ agentId: z.string().max(80) }).strict().parse(value), async ({ agentId }, client) => {
    try {
      await manager.restart(agentId)
      snapshot(client)
    }
    catch { snapshot(client, 'Cannot restart agent; check command and logs') }
  })
  channel.on('histoire:ui:agent-permission-reply', value => z.object({ requestId: z.string().uuid(), allow: z.boolean(), remember: z.boolean().optional() }).strict().parse(value), ({ requestId, allow, remember }) => manager.replyPermission(requestId, allow, remember === true))
  if (server) channel.addCleanup(registerAgentEnvironment(ctx, server, manager, () => active))
  channel.addCleanup(async () => {
    active = false
    await manager.close()
  })
  return manager
}
