import type { HistoireConfig } from '@histoire/shared'

/** CLI fields accepted without importing MCP SDK on the disabled dev path. */
export interface DevMcpCliOptions {
  /** Explicit enable, or false from Sade's --no-mcp handling. */
  'mcp'?: boolean
  /** Explicit disable, preserved separately to detect conflicting CLI flags. */
  'no-mcp'?: boolean
  /** Explicit listening port; zero requests an ephemeral port. */
  'mcp-port'?: string | number
}

/** Resolved loopback listener policy, retaining collision fallback intent. */
export interface DevMcpOptions {
  /** Whether command owns an HTTP endpoint. */
  enabled: boolean
  /** Loopback TCP port. */
  port: number
  /** Explicit ports fail on collision; only default 6007 can fall back. */
  explicitPort: boolean
}

/** Validates an explicit CLI/config TCP port without permissive parseInt coercion. */
function resolvePort(value: string | number): number {
  if (typeof value === 'string' && !/^\d+$/.test(value)) throw new Error('MCP port must be an integer from 0 to 65535')
  const port = Number(value)
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('MCP port must be an integer from 0 to 65535')
  return port
}

/** Resolves default-on config and explicit CLI overrides independently of UI --host. */
export function resolveDevMcpOptions(config: HistoireConfig['mcp'], cli: DevMcpCliOptions): DevMcpOptions {
  const disabled = cli['no-mcp'] === true || cli.mcp === false
  if (disabled && cli.mcp === true) throw new Error('--mcp and --no-mcp cannot be combined')
  if (disabled && cli['mcp-port'] !== undefined) throw new Error('--no-mcp and --mcp-port cannot be combined')
  const configOptions = typeof config === 'object' && config !== null ? config : undefined
  const port = cli['mcp-port'] ?? configOptions?.port
  return {
    enabled: disabled ? false : cli.mcp === true || cli['mcp-port'] !== undefined ? true : config === false ? false : configOptions?.enabled !== false,
    port: port === undefined ? 6007 : resolvePort(port),
    explicitPort: port !== undefined,
  }
}
