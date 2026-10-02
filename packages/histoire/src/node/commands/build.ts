import type { BuildTarget } from '../build/node/target.js'
import { fileURLToPath } from 'node:url'
import { build } from '../build/index.js'
import { createContext } from '../context.js'
import { exitAfterFlush } from '../util/exit.js'

export interface BuildOptions {
  config?: string
  /** Explicit deployment output target overrides project config. */
  target?: BuildTarget
}

export async function buildCommand(options: BuildOptions) {
  const ctx = await createContext({
    configFile: options.config,
    mode: 'build',
  })
  await build(ctx, { target: options.target, nodeEntryFile: fileURLToPath(new URL('../deploy/entry.js', import.meta.url)) })

  // Same safety net as `histoire test`: browser story collection can leave a
  // Playwright browser or a Vite server behind when its teardown times out,
  // which would hang the CLI in CI long after the build succeeded.
  await exitAfterFlush()
}
