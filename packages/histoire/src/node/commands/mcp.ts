import { realpath, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { startHistoireStdio } from '../mcp/transport/stdio.js'

/** Local launch options, unavailable as callable MCP methods. */
export interface McpOptions {
  /** Selected existing project directory, relative to launch cwd. */
  root?: string
  /** Explicit configuration file, relative to selected project. */
  config?: string
}

/** Resolve one owned project without changing parent cwd or evaluating its config. */
export async function mcpCommand(options: McpOptions) {
  const root = await realpath(resolve(options.root ?? process.cwd()))
  if (!(await stat(root)).isDirectory()) throw new Error('Histoire MCP root must be an existing directory')
  const config = options.config === undefined ? undefined : resolve(root, options.config)
  return startHistoireStdio({ root, config })
}
