import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ViteDevServer } from 'vite'
import type { AcpManager } from '../../acp/manager.js'
import type { Context } from '../../context.js'
import { z } from 'zod'
import { isAgentEnvironmentOrigin, readAgentJsonBody } from './agents-env.js'
import { registerUiHttpRoute, uiHttpPath } from './http.js'

/** Catalog HTTP avoids putting unbounded registry/model lists on HMR snapshots. */
export function registerAgentsCatalog(ctx: Context, server: ViteDevServer, manager: AcpManager, isActive: () => boolean): () => void {
  const prefix = uiHttpPath(server, '/__histoire/agents/')
  const paths = ['registry/refresh', 'registry', 'config-options']
  const cleanups = paths.map((suffix) => {
    const endpoint = `${prefix}${suffix}`
    return registerUiHttpRoute(server, endpoint, (request: IncomingMessage, response: ServerResponse, next) => {
      if (request.url?.split('?')[0] !== endpoint) return next()
      response.setHeader('Cache-Control', 'no-store')
      response.setHeader('Content-Type', 'application/json')
      response.setHeader('X-Content-Type-Options', 'nosniff')
      /** Responses carry only controlled errors and generation-owned public results. */
      async function run(): Promise<void> {
        const read = suffix === 'registry'
        if (ctx.mode !== 'dev' || !isActive() || (read ? request.method !== 'GET' : !isAgentEnvironmentOrigin(request))) {
          response.statusCode = 403
          response.end(JSON.stringify({ error: 'Agent request refused' }))
          return
        }
        let validatedDiscovery = false
        try {
          const input = read ? undefined : await readAgentJsonBody(request)
          if (!isActive()) throw new Error('Agent runtime closed')
          let result: unknown
          if (suffix === 'config-options') {
            const { agentId, force } = z.object({ agentId: z.string().regex(/^[\w-]{1,80}$/), force: z.boolean().optional() }).strict().parse(input)
            validatedDiscovery = true
            result = await manager.configOptions(agentId, force)
          }
          else {
            if (!read) z.object({}).strict().parse(input)
            result = await manager.registry(!read)
          }
          if (!isActive()) throw new Error('Agent runtime closed')
          response.end(JSON.stringify(result))
        }
        catch (error) {
          response.statusCode = 400
          // Discovery sanitizes captured launch environment and SDK failures.
          // Validation failures never echo untrusted input or Zod diagnostics.
          response.end(JSON.stringify({ error: validatedDiscovery && error instanceof Error ? error.message.slice(0, 2000) : suffix === 'config-options' ? 'Cannot load agent models; check command, authentication and logs' : 'Cannot load agent registry' }))
        }
      }
      void run().catch(() => {
        response.destroy()
      })
    }, isActive)
  })
  return () => {
    for (const cleanup of cleanups) cleanup()
  }
}
