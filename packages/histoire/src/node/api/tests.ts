import type { ProjectServices } from './internal.js'
import type { HistoireRunTestsOptions } from './types.js'
import { HistoireSdkError } from '@histoire/protocol'
import { closeContext, createContext } from '../context.js'
import { lookupStory, lookupTarget, validId } from '../runtime/catalog/lookup.js'
import { createHistoireTestTask } from '../test/execution-service.js'
import { awaitSdkExecution, toSdkExecutionError } from './execution.js'

/** Runs a fresh context through the one project lane; runner owns dependency preflight. */
export async function runProjectTests(services: ProjectServices, options: HistoireRunTestsOptions = {}) {
  try {
    for (const id of [options.storyId, options.variantId]) {
      if (id !== undefined && !validId(id)) throw new HistoireSdkError('INVALID_ARGUMENT', 'Test target IDs must be non-empty strings')
    }
    if (options.variantId !== undefined && options.storyId === undefined) throw new HistoireSdkError('INVALID_ARGUMENT', 'variantId requires storyId')
    if (options.signal?.aborted) throw new HistoireSdkError('CANCELLED', 'Histoire test run cancelled')
    const dev = services.dev
    const runtime = dev?.controller.current
    const snapshot = dev?.catalog?.current
    if (dev && (dev.handle.status !== 'ready' || !runtime?.isActive() || !snapshot || dev.catalog.updating)) throw new HistoireSdkError('CAPABILITY_UNAVAILABLE', 'Development test engine unavailable')
    if (runtime && snapshot) {
      if (options.storyId !== undefined) lookupStory(snapshot, options.storyId)
      if (options.variantId !== undefined) lookupTarget(snapshot, options.storyId!, options.variantId)
      const task = createHistoireTestTask(runtime.context, { storyId: options.storyId, variantId: options.variantId })
      return awaitSdkExecution(dev!.execution.enqueue({ ...task, validate() {
        task.validate?.()
        if (!runtime.isActive() || dev!.catalog?.current !== snapshot || dev!.catalog.updating) throw new HistoireSdkError('RUNTIME_CHANGED', 'Test source changed')
      } }), options.signal)
    }
    const handle = services.execution.enqueue({
      async run(signal) {
        const context = await createContext({ root: services.root, configFile: services.configFile, mode: 'dev' })
        try {
          signal.throwIfAborted()
          const { runHistoireTests } = await import('../test/index.js')
          return await runHistoireTests(context, { storyId: options.storyId, variantId: options.variantId, signal, strictCleanup: true, isolate: true, maxRetries: 0 })
        }
        finally {
          await closeContext(context)
        }
      },
    })
    return awaitSdkExecution(handle, options.signal)
  }
  // Admission throws synchronously before awaitSdkExecution can map lane errors.
  catch (error) { throw toSdkExecutionError(error) }
}
