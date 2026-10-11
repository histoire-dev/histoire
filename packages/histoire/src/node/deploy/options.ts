import type { HistoireBrowserConfig, HistoireBrowserSource } from '@histoire/shared'
import type { BrowserSetupPolicy } from '../runtime/browser/setup/types.js'
import { isIP } from 'node:net'
import { captureMcpToken, validateMcpToken } from '../mcp/transport/http-auth.js'
import { createBrowserSetupPolicy } from '../runtime/browser/setup/policy.js'

const browserSources = new Set<HistoireBrowserSource>(['auto', 'headless-shell', 'chromium', 'chrome', 'msedge', 'executable'])

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

/**
 * Converts target-owned deployment environment into one project-root policy.
 * @param environment Target process environment.
 * @param artifactRoot Real copied-artifact root for relative executable paths.
 */
export function resolveNodeBrowserPolicy(environment: NodeJS.ProcessEnv, artifactRoot: string): BrowserSetupPolicy {
  const source = environment.HISTOIRE_BROWSER_SOURCE ?? 'auto'
  const executablePath = environment.HISTOIRE_BROWSER_EXECUTABLE_PATH
  if (!browserSources.has(source as HistoireBrowserSource)) {
    throw new Error('HISTOIRE_BROWSER_SOURCE must be auto, headless-shell, chromium, chrome, msedge, or executable')
  }
  if (executablePath !== undefined && source !== 'executable') {
    throw new Error('HISTOIRE_BROWSER_EXECUTABLE_PATH requires HISTOIRE_BROWSER_SOURCE=executable')
  }
  if (source === 'executable' && (!executablePath || executablePath.trim().length === 0)) {
    throw new Error('HISTOIRE_BROWSER_EXECUTABLE_PATH is required when HISTOIRE_BROWSER_SOURCE=executable')
  }

  const config: HistoireBrowserConfig = source === 'executable'
    ? { source, executablePath: executablePath! }
    : { source: source as Exclude<HistoireBrowserSource, 'executable'> }
  try {
    return createBrowserSetupPolicy(config, artifactRoot)
  }
  catch {
    throw new Error('HISTOIRE_BROWSER_EXECUTABLE_PATH must be a local filesystem path')
  }
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
