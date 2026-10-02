import type { createDevMcpRuntime } from '../mcp/dev-runtime.js'
import type { DevMcpCliOptions } from '../mcp/transport/http-options.js'
import type { ProjectRuntimeOptions } from '../runtime/types.js'
import pc from 'picocolors'
import { captureMcpToken } from '../mcp/transport/http-auth.js'
import { resolveDevMcpOptions } from '../mcp/transport/http-options.js'
import { createProjectRuntimeController } from '../runtime/controller.js'
import { createExecutionService } from '../runtime/execution-service.js'

/** Options forwarded from the dev CLI to its owned project runtime. */
export interface DevOptions extends ProjectRuntimeOptions, DevMcpCliOptions {
  /** Client-facing book port. */
  port: number
}

/** Starts dev with one restart controller and owned shutdown signal listeners. */
export async function devCommand(options: DevOptions) {
  // Capture before configuration evaluation. Project hooks and browser/worker
  // environment never receive the listener credential, including on restart.
  const token = captureMcpToken()
  resolveDevMcpOptions(undefined, options)
  let mcp: Awaited<ReturnType<typeof createDevMcpRuntime>> | undefined
  let closing: Promise<void> | undefined
  const execution = options.execution ?? createExecutionService()
  const controller = createProjectRuntimeController({
    ...options,
    execution,
    async onBeforeRelease(handle) {
      if (mcp) await mcp.operations.invalidate(handle.epoch)
      else await execution.cancelAll()
      await options.onBeforeRelease?.(handle)
    },
    async onGeneration(handle) {
      const policy = resolveDevMcpOptions(handle.context.config.mcp, options)
      if (options.devHttp === false) policy.enabled = false
      if (policy.enabled && !mcp) {
        const { createDevMcpRuntime } = await import('../mcp/dev-runtime.js')
        mcp = await createDevMcpRuntime({ controller, root: handle.context.root, token, execution })
      }
      await mcp?.reconcile(policy)
      await options.onGeneration?.(handle)
    },
    onError: error => console.error(error),
  })
  const stopObservation = controller.subscribe((status, handle) => {
    if (status === 'restarting') console.log(pc.blue('Config changed, restarting...'))
    if (status === 'ready' && handle?.isActive()) {
      handle.server.printUrls()
      if (mcp?.url) console.log(`  MCP: ${mcp.url}${token === undefined ? '' : ' (bearer token required)'}`)
    }
  })
  /** Releases command listeners before bounded runtime teardown. */
  async function close() {
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
    stopObservation()
    return closing ??= (async () => {
      try {
        if (mcp) await mcp.close()
        else await execution.close()
      }
      finally { await controller.close() }
    })()
  }
  /** Observes shutdown rejection without escaping a process signal callback. */
  function onSignal() {
    void close().catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
  }
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)
  try {
    await controller.start()
    return {
      controller,
      execution,
      get mcp() { return mcp },
      close,
    }
  }
  catch (error) {
    await close()
    throw error
  }
}
