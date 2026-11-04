import type { DevInjection } from '@histoire/cli'
import { captureMcpToken } from '../mcp/transport/http-auth.js'
import { resolveDevMcpOptions } from '../mcp/transport/http-options.js'

/**
 * Histoire inputs of the dev parent in `@histoire/cli`. Loaded before the public
 * port binds, so it imports only the light MCP option/credential helpers and never the runtime.
 */
export const devInjection: DevInjection = {
  runtime: new URL('./dev-child.js', import.meta.url),
  captureMcpToken,
  resolveDevMcpOptions,
}
