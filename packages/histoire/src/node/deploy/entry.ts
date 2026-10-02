import { realpathSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sanitizeDiagnosticMessage } from '../mcp/project/diagnostics.js'
import { createNodeServer } from './server.js'

export { readNodeArtifact } from './artifact-reader.js'
export type { NodeExecutionValue } from './execution.js'
export { createNodeServer } from './server.js'
export type { CreateNodeServerOptions } from './server.js'

/** Direct generated entry boot; native imports expose factories without listening. */
export async function startNodeArtifact() {
  process.env.NODE_ENV ??= 'production'
  const directory = dirname(fileURLToPath(import.meta.url))
  const secret = process.env.HISTOIRE_MCP_TOKEN
  let runtime: Awaited<ReturnType<typeof createNodeServer>>
  try {
    runtime = await createNodeServer({ artifactDirectory: directory })
  }
  catch (error) {
    throw new Error(sanitizeDiagnosticMessage(error, directory, secret))
  }
  let stopping = false
  /** Signals share one awaited graceful shutdown and bounded diagnostic. */
  const stop = () => {
    if (stopping) return
    stopping = true
    process.removeListener('SIGINT', stop)
    process.removeListener('SIGTERM', stop)
    void runtime.close().catch(() => {
      process.stderr.write('Histoire deployment cleanup could not be confirmed\n', () => process.exit(1))
    })
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  process.stdout.write(`Histoire book: ${runtime.publicOrigin}${runtime.artifact.manifest.base}\n`)
  if (runtime.mcpUrl) process.stdout.write(`Histoire MCP: ${runtime.mcpUrl}\n`)
  return runtime
}

/** Real script identity handles symlinked release directories without import side effects. */
export function isDirectNodeEntry(moduleUrl: string, argument = process.argv[1]): boolean {
  if (!argument || process.execArgv.some(value => ['-e', '--eval', '-p', '--print'].includes(value))) return false
  try {
    return realpathSync(resolve(argument)) === realpathSync(fileURLToPath(moduleUrl))
  }
  catch { return false }
}

if (isDirectNodeEntry(import.meta.url)) {
  void startNodeArtifact().catch((error) => {
    console.error(`Histoire deployment failed to start: ${error.message}`)
    process.exitCode = 1
  })
}
