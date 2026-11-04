import type { ProjectRuntimeDependencies } from './types.js'
import { resolve } from 'pathe'
import { closeContext, createContext } from '../context.js'
import { createServer } from '../server/index.js'
import { captureProjectConfigurationRevision } from './config-watchers.js'
import { createStartupProgress } from './terminal/progress.js'

/** Loads project configuration and starts an abort-aware dev generation. */
export const startProjectRuntime: ProjectRuntimeDependencies['start'] = async (options, signal, isActive) => {
  const root = resolve(options.root ?? process.cwd())
  const configurationRevision = await captureProjectConfigurationRevision(root, options.config)
  // Publication stops as soon as this generation is cancelled or superseded.
  const progress = createStartupProgress(options.onProgress, () => !signal.aborted && isActive())
  const context = await progress.track('config', () => createContext({ root, mode: 'dev', configFile: options.config, onConfigurationInputs: options.onConfigurationInputs }))
  try {
    await options.onConfiguration?.(context, configurationRevision)
    signal.throwIfAborted()
    const runtime = await createServer(context, { ...options, signal, isActive, progress })
    return {
      ...runtime,
      context,
      configurationRevision,
      get collectionOutcomes() { return runtime.collectionOutcomes },
    }
  }
  catch (error) {
    try {
      await closeContext(context)
    }
    catch (cleanupError) {
      throw new AggregateError([error, cleanupError], String(error))
    }
    throw error
  }
}
