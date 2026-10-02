import type { ExecutionService } from '../runtime/execution-service.js'
import type { McpRuntimeController } from './project/dev-facade.js'
import type { HistoireMcpServerOptions } from './server/factory.js'
import type { DevMcpOptions } from './transport/http-options.js'
import { randomUUID } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { createExecutionService } from '../runtime/execution-service.js'
import { registerDevScreenshotExecutor } from './browser/dev.js'
import { createDevMcpOperations } from './operations/dev.js'
import { registerDevTestExecutor } from './operations/tests.js'
import { readHistoireVersion } from './package-version.js'
import { createDevMcpProject } from './project/dev-facade.js'
import { createMcpProjectId } from './protocol/ids.js'
import { createHistoireMcpServer } from './server/factory.js'
import { createOperationServerExtension } from './server/operation-tools.js'
import { createMcpBearerPrincipal } from './transport/http-auth.js'
import { startDevMcpHttp } from './transport/http.js'

/** Optional shared execution extension; one owner survives HTTP request factories. */
export type DevMcpServerExtension = Pick<HistoireMcpServerOptions, 'register' | 'readResource'>

/** Owns one dev facade and reconciles HTTP policy independently of project generations. */
export async function createDevMcpRuntime(options: { controller: McpRuntimeController, root: string, token?: string, extension?: DevMcpServerExtension, execution?: ExecutionService }) {
  const execution = options.execution ?? createExecutionService()
  const project = createDevMcpProject({ controller: options.controller, projectId: createMcpProjectId(await realpath(options.root)), secret: options.token, executionAvailable: () => execution.available })
  const operations = createDevMcpOperations(project, execution)
  registerDevScreenshotExecutor(operations)
  registerDevTestExecutor(operations, options.token)
  const extension = createOperationServerExtension(operations)
  const version = readHistoireVersion()
  const principal = options.token === undefined ? `local:${randomUUID()}` : createMcpBearerPrincipal(options.token)
  const factory = () => createHistoireMcpServer({ project, principal, version, ...extension, ...options.extension })
  let listener: Awaited<ReturnType<typeof startDevMcpHttp>> | undefined
  let policy: DevMcpOptions | undefined
  let closed = false
  let closing: Promise<void> | undefined
  return {
    /** Actual bound URL, including default-port collision fallback. */
    get url() { return listener?.url },
    /** Shared facade available to later controller-owned screenshot/test services. */
    project,
    /** Concrete feature slices register executors once for all request factories. */
    operations,
    /** Keeps unchanged listener stable; replaces changed enable/port policy after closing old socket. */
    async reconcile(next: DevMcpOptions) {
      if (closed) throw new Error('Dev MCP runtime is closed')
      project.getProject()
      if (policy && policy.enabled === next.enabled && policy.port === next.port && policy.explicitPort === next.explicitPort) return
      const old = listener
      listener = undefined
      policy = undefined
      await old?.close()
      if (next.enabled) listener = await startDevMcpHttp({ ...next, factory, principal, token: options.token })
      policy = next
    },
    /** Stops transport admission before dropping private catalog/content observers. */
    close() {
      closed = true
      return closing ??= (async () => {
        try {
          await listener?.close()
        }
        finally {
          listener = undefined
          try {
            await operations.close()
          }
          finally { project.close() }
        }
      })()
    },
  }
}
