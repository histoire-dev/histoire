import type { DevMcpCliOptions } from '@histoire/cli'
import type { createDevMcpRuntime } from '../mcp/dev-runtime.js'
import type { ProjectRuntimeOptions } from './types.js'
import { randomUUID } from 'node:crypto'
import { resolveDevMcpOptions } from '../mcp/transport/http-options.js'
import { attachRuntimeCatalog } from './catalog/attachment.js'
import { createProjectRuntimeController } from './controller.js'
import { createExecutionOwner } from './execution-owner.js'
import { createExecutionService } from './execution-service.js'
import { createStartupProgress } from './terminal/progress.js'

/** Reuses canonical controller/MCP assembly without command signal or process mutation. */
export function createDevSession(options: ProjectRuntimeOptions & DevMcpCliOptions & { /** Stable SDK project identity; CLI may generate one session identity. */ projectId?: string }, token?: string, createController = createProjectRuntimeController) {
  resolveDevMcpOptions(undefined, options)
  const execution = options.execution ? createExecutionOwner(options.execution) : createExecutionService()
  let mcp: Awaited<ReturnType<typeof createDevMcpRuntime>> | undefined
  let closing: Promise<void> | undefined
  let attached: ReturnType<typeof attachRuntimeCatalog> | undefined
  const projectId = options.projectId ?? randomUUID()
  const controller = createController({
    ...options,
    execution,
    async onBeforeRelease(handle) {
      // The scoped adapter drains dev UI/MCP work without cancelling an
      // independent built-preview submission on the project's shared lane.
      await execution.cancelAll()
      await mcp?.operations.invalidate(handle.epoch)
      attached?.close()
      attached = undefined
      await options.onBeforeRelease?.(handle)
    },
    async onGeneration(handle) {
      const progress = createStartupProgress(options.onProgress, () => handle.isActive())
      progress.begin('attach')
      try {
        // Attach before optional MCP starts accepting traffic so all adapters
        // discover the same provider, identity and diagnostic secret policy.
        attached = attachRuntimeCatalog(handle, { projectId, epoch: handle.epoch, secret: token })
        const policy = resolveDevMcpOptions(handle.context.config.mcp, options)
        if (options.devHttp === false) policy.enabled = false
        if (policy.enabled && !mcp) {
          const { createDevMcpRuntime } = await import('../mcp/dev-runtime.js')
          mcp = await createDevMcpRuntime({ controller, root: handle.context.root, token, execution, ownsExecution: false, projectId: options.devProxy ? projectId : undefined })
        }
        await mcp?.reconcile(policy)
        await options.onGeneration?.(handle)
        await attached.ready
        progress.complete('attach')
      }
      catch (error) {
        progress.fail('attach', error)
        throw error
      }
    },
  })
  return {
    controller,
    execution,
    /** Active optional dev HTTP adapter, owned independently of book listener. */
    get mcp() {
      return mcp
    },
    /** Releases every session-owned adapter, preserving an injected parent lane. */
    close() {
      return closing ??= (async () => {
        try {
          await controller.close()
        }
        finally {
          try {
            await mcp?.close()
          }
          finally {
            await execution.close()
          }
        }
      })()
    },
  }
}
