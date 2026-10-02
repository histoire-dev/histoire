import { createProjectRuntimeController } from '../../runtime/controller.js'
import { createExecutionService } from '../../runtime/execution-service.js'
import { registerDevScreenshotExecutor } from '../browser/dev.js'
import { createDevMcpOperations } from '../operations/dev.js'
import { registerDevTestExecutor } from '../operations/tests.js'
import { createDevMcpProject } from '../project/dev-facade.js'

/** Own project, facade and execution services even when dev HTTP is disabled. */
export function createWorkerRuntime(options: { config?: string, projectId: string }) {
  const execution = createExecutionService()
  let operations: ReturnType<typeof createDevMcpOperations>
  const controller = createProjectRuntimeController({
    config: options.config,
    host: '127.0.0.1',
    port: 0,
    open: false,
    devHttp: false,
    execution,
    async onBeforeRelease(handle) { await operations.invalidate(handle.epoch) },
    onError: error => console.error(error),
  })
  const project = createDevMcpProject({ controller, projectId: options.projectId, executionAvailable: () => execution.available })
  operations = createDevMcpOperations(project, execution)
  registerDevScreenshotExecutor(operations)
  registerDevTestExecutor(operations)
  let closing: Promise<void> | undefined
  return {
    /** Public read facade; private capture remains inside this worker. */
    project,
    /** Concrete executor registration seam shared with dev HTTP. */
    operations,
    /** Collection startup is observed asynchronously by worker entry. */
    start: () => controller.start(),
    /** Drain operations before releasing catalog observers and runtime resources. */
    close() {
      return closing ??= (async () => {
        try {
          await operations.close()
        }
        finally {
          project.close()
          await controller.close()
        }
      })()
    },
  }
}
