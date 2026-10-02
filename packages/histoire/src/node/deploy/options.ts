import { isIP } from 'node:net'
import { captureMcpToken, validateMcpToken } from '../mcp/transport/http-auth.js'

/** Validated immutable listener settings; no project config or proxy input. */
export interface NodeServerOptions {
  /** Exact TCP hostname or IP to bind. */
  host: string
  /** Fixed port, with zero reserved for explicit ephemeral tests. */
  port: number
  /** Canonical public origin; loopback may derive actual bound origin. */
  publicOrigin?: string
  /** Effective artifact policy plus explicit CLI override. */
  mcpEnabled: boolean
  /** Private captured credential, never projected into project data. */
  token?: string
}

/** Derive only documented production env/flags, removing credential immediately. */
export function resolveNodeOptions(defaultMcp: boolean, environment: NodeJS.ProcessEnv = process.env, argumentsList = process.argv.slice(2)): NodeServerOptions {
  const token = captureMcpToken(environment)
  if (argumentsList.includes('--mcp') && argumentsList.includes('--no-mcp')) throw new Error('--mcp and --no-mcp cannot be combined')
  if (argumentsList.some(argument => argument !== '--mcp' && argument !== '--no-mcp')) throw new Error('Unknown deployed server argument')
  const mcpEnabled = argumentsList.includes('--mcp') || (defaultMcp && !argumentsList.includes('--no-mcp'))
  const host = environment.HOST ?? '0.0.0.0'
  if (!host || host.length > 253 || (!isIP(host) && !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(host))) throw new Error('HOST must be a TCP hostname or IP address')
  const rawPort = environment.PORT ?? '3000'
  if (!/^\d{1,5}$/.test(rawPort) || Number(rawPort) > 65535) throw new Error('PORT must be an integer from 0 to 65535')
  let publicOrigin = environment.PUBLIC_ORIGIN
  if (publicOrigin !== undefined) {
    try {
      const origin = new URL(publicOrigin)
      if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== publicOrigin || origin.username || origin.password) throw new Error('Invalid origin')
    }
    catch { throw new Error('PUBLIC_ORIGIN must be a canonical HTTP(S) origin') }
  }
  else if (!['127.0.0.1', '::1', 'localhost'].includes(host)) {
    throw new Error('PUBLIC_ORIGIN is required for a remote listener')
  }
  if (mcpEnabled) validateMcpToken(token, true)
  else publicOrigin ??= undefined
  return { host, port: Number(rawPort), publicOrigin, mcpEnabled, ...(mcpEnabled ? { token } : {}) }
}
