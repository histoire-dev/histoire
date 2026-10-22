import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ViteDevServer } from 'vite'
import type { AcpManager } from '../../acp/manager.js'
import type { Context } from '../../context.js'
import { validateAgentEnvironment } from '../../acp/validation.js'
import { isSameOriginPost, readJsonBody } from './http-body.js'
import { registerUiHttpRoute, uiHttpPath } from './http.js'

/** Credential write endpoint stays outside the HMR channel and has no read route. */
export const AGENT_ENVIRONMENT_PATH = '/__histoire/agents/environment'

/** Mounts write-only local credentials for an exact active development context. */
export function registerAgentEnvironment(ctx: Context, server: ViteDevServer, manager: AcpManager, isActive: () => boolean): () => void {
  const endpoint = uiHttpPath(server, AGENT_ENVIRONMENT_PATH)
  return registerUiHttpRoute(server, endpoint, (request: IncomingMessage, response: ServerResponse, next) => {
    if (request.url?.split('?')[0] !== endpoint) return next()
    response.setHeader('Cache-Control', 'no-store')
    /** Responds deliberately without echoing request/exception details. */
    async function save(): Promise<void> {
      if (ctx.mode !== 'dev' || !isActive() || !isSameOriginPost(request)) {
        response.statusCode = 403
        response.end('Credential write refused')
        return
      }
      try {
        const { agentId, env } = validateAgentEnvironment(await readJsonBody(request))
        if (!isActive()) throw new Error('Agent runtime closed')
        await manager.setEnvironment(agentId, env)
        response.statusCode = 204
        response.end()
      }
      catch {
        response.statusCode = 400
        response.end('Cannot save agent environment')
      }
    }
    void save().catch(() => {
      response.statusCode = 500
      response.end('Cannot save agent environment')
    })
  }, isActive)
}
