import type { ProjectRuntimeDependencies } from './types.js'
import { resolve } from 'pathe'
import { closeContext, createContext } from '../context.js'
import { createServer } from '../server/index.js'
import { captureProjectConfigurationRevision } from './config-watchers.js'

/** Loads project configuration and starts an abort-aware dev generation. */
export const startProjectRuntime: ProjectRuntimeDependencies['start'] = async (options, signal, isActive) => {
  const root = resolve(options.root ?? process.cwd())
  const configurationRevision = await captureProjectConfigurationRevision(root, options.config)
  const context = await createContext({ root, mode: 'dev', configFile: options.config })
  try {
    signal.throwIfAborted()
    const runtime = await createServer(context, { ...options, signal, isActive })
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
