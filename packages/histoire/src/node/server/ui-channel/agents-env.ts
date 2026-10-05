import type { IncomingMessage, ServerResponse } from 'node:http'
import type { TLSSocket } from 'node:tls'
import type { ViteDevServer } from 'vite'
import type { AcpManager } from '../../acp/manager.js'
import type { Context } from '../../context.js'
import { Buffer } from 'node:buffer'
import { validateAgentEnvironment } from '../../acp/validation.js'
import { registerUiHttpRoute, uiHttpPath } from './http.js'

/** Credential write endpoint stays outside the HMR channel and has no read route. */
export const AGENT_ENVIRONMENT_PATH = '/__histoire/agents/environment'

/** Rejects cross-origin browser credential writes before reading the secret body. */
export function isAgentEnvironmentOrigin(request: IncomingMessage): boolean {
  if (request.method !== 'POST' || !request.headers.origin || !request.headers.host || request.headers['content-type']?.split(';')[0] !== 'application/json') return false
  try {
    const origin = new URL(request.headers.origin)
    const protocol = (request.socket as TLSSocket)?.encrypted ? 'https:' : 'http:'
    return origin.protocol === protocol && origin.origin === request.headers.origin && !origin.username && !origin.password && origin.host === request.headers.host
  }
  catch { return false }
}

/** Reads at most 64 KB without logging or echoing the private payload. */
async function readEnvironmentBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk)
    bytes += buffer.length
    if (bytes > 64 * 1024) throw new Error('Credential request is too large')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

/** Mounts write-only local credentials for an exact active development context. */
export function registerAgentEnvironment(ctx: Context, server: ViteDevServer, manager: AcpManager, isActive: () => boolean): () => void {
  const endpoint = uiHttpPath(server, AGENT_ENVIRONMENT_PATH)
  return registerUiHttpRoute(server, endpoint, (request: IncomingMessage, response: ServerResponse, next) => {
    if (request.url?.split('?')[0] !== endpoint) return next()
    response.setHeader('Cache-Control', 'no-store')
    /** Responds deliberately without echoing request/exception details. */
    async function save(): Promise<void> {
      if (ctx.mode !== 'dev' || !isActive() || !isAgentEnvironmentOrigin(request)) {
        response.statusCode = 403
        response.end('Credential write refused')
        return
      }
      try {
        const { agentId, env } = validateAgentEnvironment(await readEnvironmentBody(request))
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
