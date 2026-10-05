import type { DevMcpCliOptions } from '../mcp/transport/http-options.js'
import type { ProjectRuntimeOptions } from '../runtime/types.js'
import pc from 'picocolors'
import { captureMcpToken } from '../mcp/transport/http-auth.js'
import { createDevSession } from '../runtime/dev-session.js'

/** Options forwarded from CLI to canonical dev session. */
export interface DevOptions extends ProjectRuntimeOptions, DevMcpCliOptions {
  /** Client-facing book port. */
  port: number
}

/** Command owns presentation, credential extraction and process shutdown listeners. */
export async function devCommand(options: DevOptions) {
  const token = captureMcpToken()
  const session = createDevSession({ ...options, onError: error => console.error(error) }, token)
  let closing: Promise<void> | undefined
  const stopObservation = session.controller.subscribe((status, handle) => {
    if (status === 'restarting') console.log(pc.blue('Config changed, restarting...'))
    if (status === 'ready' && handle?.isActive()) {
      handle.server.printUrls()
      if (session.mcp?.url) console.log(`  MCP: ${session.mcp.url}${token === undefined ? '' : ' (bearer token required)'}`)
    }
  })
  /** Releases only command-owned signal listeners before bounded resource teardown. */
  function close() {
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
    stopObservation()
    return closing ??= session.close()
  }
  /** Handles command shutdown failure without throwing out of process callbacks. */
  function onSignal() {
    void close().catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
  }
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)
  try {
    await session.controller.start()
    return { ...session, get mcp() {
      return session.mcp
    }, close }
  }
  catch (error) {
    await close()
    throw error
  }
}
