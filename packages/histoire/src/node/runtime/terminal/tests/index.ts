import type { TerminalHandlerContext } from '../registry.js'
import type { TestsService, TestsServiceOptions } from './service.js'
import { createTestsService } from './service.js'

/** One service per runtime generation; it dies with the handle (and is released by the adapter scope). */
const services = new WeakMap<object, TestsService>()

/**
 * Returns the terminal test service of the context's generation, creating it
 * on first use. Slices 09/10 call this from their own handlers to run the
 * affected-subset batch (`service.runAffected`) in the same operation space.
 * @param context Handler context of the current generation.
 */
export function getTestsService(context: TerminalHandlerContext): TestsService {
  let service = services.get(context.handle)
  if (!service) {
    service = createTestsService({ handle: context.handle, catalog: context.catalog, execution: context.execution, emit: context.emit as TestsServiceOptions['emit'], signal: context.signal })
    services.set(context.handle, service)
  }
  return service
}

export { createAffectedBatchTask } from './batch.js'
export type { AffectedBatch, BatchItem, BatchProgress } from './batch.js'
export type { AdmittedRun, TestsService, TestsServiceOptions } from './service.js'
