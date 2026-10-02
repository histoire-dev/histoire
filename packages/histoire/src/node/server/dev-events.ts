import type { ViteDevServer } from 'vite'
import type { Context } from '../context.js'
import type { useModuleLoader } from '../load.js'
import type { ExecutionService } from '../runtime/execution-service.js'
import { DevEventPluginApi } from '../plugin.js'
import { createExecutionService } from '../runtime/execution-service.js'
import { enqueueHistoireTestRun } from '../test/execution-service.js'

/** Websocket client a dev event is replied to. */
type DevEventClient = Parameters<Parameters<ViteDevServer['ws']['on']>[1]>[1]

/**
 * Renders an error for the `dev-event-result` payload.
 * @param error The error that ended the dev event.
 */
function formatDevEventError(error: unknown) {
  return error instanceof Error ? (error.stack ?? error.message) : String(error)
}

/**
 * Registers the `histoire:dev-event` websocket handler: the UI-triggered test
 * runs and the plugin `onDevEvent` hooks.
 *
 * @param ctx Histoire context, forwarded to the plugin API and the test runner.
 * @param server Client-facing Vite dev server owning the websocket.
 * @param moduleLoader Loader bound to the node-side collection server, handed
 * to the plugin API.
 */
export function registerDevEvents(ctx: Context, server: ViteDevServer, moduleLoader: ReturnType<typeof useModuleLoader>, execution?: ExecutionService, isActive = () => true) {
  const lane = execution ?? createExecutionService()
  if (!execution) {
    server.httpServer?.once('close', () => {
      void lane.close().catch(() => {})
    })
  }

  /** Submit own target to controller-owned lane with independent result. */
  function queueStoryTestRun(payload: any) {
    if (!isActive()) throw new Error('Project runtime closed')
    return enqueueHistoireTestRun(lane, ctx, {
      storyId: payload?.storyId,
      variantId: payload?.variantId,
    }, isActive).result
  }

  /**
   * Runs the plugin `onDevEvent` hooks until one of them answers the event.
   * @param event Name of the dev event.
   * @param payload Payload sent by the UI.
   * @param requestId Id the reply is correlated with.
   * @param client Socket that sent the request.
   */
  async function runPluginDevEvent(event: string, payload: any, requestId: unknown, client: DevEventClient) {
    for (const plugin of ctx.config.plugins) {
      if (plugin.onDevEvent) {
        const api = new DevEventPluginApi(ctx, plugin, moduleLoader, event, payload)
        const result = await plugin.onDevEvent(api)
        if (!event.startsWith('on') && result !== undefined) {
          if (isActive()) client.send(`histoire:dev-event-result`, { event, requestId, result })
          break
        }
      }
    }
  }

  // Custom dev events
  // `client` is the socket that sent the request. Reply through it rather than
  // `server.ws.send` (which broadcasts to every connected tab): request ids are
  // per-client counters, so a broadcast reply can settle another tab's pending
  // request that happens to share the same id.
  server.ws.on(`histoire:dev-event`, async (data, client) => {
    const { event, payload, requestId } = data ?? {}
    // The payload comes from the browser: a malformed message must not throw
    // out of this callback (see below), and `event` is used as a string below.
    if (typeof event !== 'string') {
      return
    }

    // Every path replies, even on failure: an unguarded rejection would escape
    // this async ws.on callback (unhandled, killing the process on recent Node)
    // and leave the UI stuck on "Running…" forever.
    try {
      if (event === 'runStoryTests') {
        const result = await queueStoryTestRun(payload)
        if (isActive()) client.send(`histoire:dev-event-result`, { event, requestId, result })
        return
      }

      await runPluginDevEvent(event, payload, requestId, client)
    }
    catch (error) {
      if (!isActive()) return
      client.send(`histoire:dev-event-result`, {
        event,
        requestId,
        error: formatDevEventError(error),
      })
    }
  })
}
