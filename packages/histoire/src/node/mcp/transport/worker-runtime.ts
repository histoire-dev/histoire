import { createProjectRuntimeController } from '../../runtime/controller.js'
import { createExecutionService } from '../../runtime/execution-service.js'
import { registerDevScreenshotExecutor } from '../browser/dev.js'
import { registerDevInspectionExecutors } from '../browser/inspection/dev.js'
import { createDevMcpActivity } from '../observer/activity.js'
import { bindMcpObserver } from '../observer/context.js'
import { createDevMcpOperations } from '../operations/dev.js'
import { registerDevTestExecutor } from '../operations/tests.js'
import { createDevMcpProject } from '../project/dev-facade.js'

/** Own project, facade and execution services even when dev HTTP is disabled. */
export function createWorkerRuntime(options: { config?: string, projectId: string }) {
  const execution = createExecutionService()
  const activity = createDevMcpActivity()
  activity.setEnabled(true)
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
  operations = createDevMcpOperations(project, execution, true, () => activity.currentClientId()!)
  const offOperations = operations.onOperationChange(activity.publish)
  registerDevScreenshotExecutor(operations)
  registerDevInspectionExecutors(operations)
  registerDevTestExecutor(operations)
  let closing: Promise<void> | undefined
  let offContext: () => void
  const runtime = {
    /** Public read facade; private capture remains inside this worker. */
    project,
    /** Concrete executor registration seam shared with dev HTTP. */
    operations: activity.observeOperations(operations),
    /** Safe worker UI observation is scoped to its own stdio-owned runtime. */
    snapshot: activity.snapshot,
    /** Persistent parent pipe metadata and current-generation activity. */
    onClientChange: activity.onClientChange,
    /** Tool reads and execution lifecycle projections, excluding private output. */
    onOperationChange: activity.onOperationChange,
    /** Trusted UI cancellation follows exact operation ownership checks. */
    cancelFromUi: operations.cancelFromUi,
    /** IPC entry wraps only protocol requests, never worker bootstrap reads. */
    observeRequest: activity.observeStdio,
    /** Finite IPC request metadata identifies public tool callbacks precisely. */
    observeReadTool: activity.observeReadTool,
    /** Parent forwards name only; handshake bodies stay out of this worker UI. */
    setClientName: activity.setClientName,
    /** Collection startup is observed asynchronously by worker entry. */
    start: () => controller.start(),
    /** Drain operations before releasing catalog observers and runtime resources. */
    close() {
      offContext()
      activity.disconnect()
      return closing ??= (async () => {
        try {
          await operations.close()
        }
        finally {
          offOperations()
          project.close()
          await controller.close()
        }
      })()
    },
  }
  offContext = bindMcpObserver(controller, runtime, activity.reset)
  return runtime
}
