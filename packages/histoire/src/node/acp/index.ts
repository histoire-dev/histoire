import type { Context } from '../context.js'
import type { AcpManager } from './manager.js'
import { getMcpObserver } from '../mcp/observer/context.js'
import { getContextRegistry } from '../runtime/registry.js'
import { createAcpManager } from './manager.js'

/** Managers belong to exact dev generations; retired contexts retain no process. */
const managers = new WeakMap<Context, AcpManager>()

/** Provides a lazy manager shared by the UI channel and comment dispatcher. */
export function getAcpManager(ctx: Context): AcpManager {
  if (ctx.mode !== 'dev') throw new Error('ACP agents are unavailable in static builds')
  let manager = managers.get(ctx)
  if (!manager) {
    manager = createAcpManager({ root: ctx.root, config: ctx.config.agents, mcpEndpoint: () => getMcpObserver(ctx)?.snapshot().endpoint })
    managers.set(ctx, manager)
    const captured = manager
    getContextRegistry(ctx).cleanup.add(async () => {
      if (managers.get(ctx) === captured) managers.delete(ctx)
      await captured.close()
    })
  }
  return manager
}

export { createAcpManager } from './manager.js'
export type { AcpManager } from './manager.js'
export type { AcpFileChange, AcpManagerOptions, AcpPromptContext, AcpPromptRequest, AcpPromptResult, AcpUpdate } from './types.js'
