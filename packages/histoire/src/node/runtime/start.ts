import type { ProjectRuntimeDependencies } from './types.js'
import { createContext } from '../context.js'
import { createServer } from '../server/index.js'

/** Loads project configuration and starts an abort-aware dev generation. */
export const startProjectRuntime: ProjectRuntimeDependencies['start'] = async (options, signal, isActive) => {
  const context = await createContext({ mode: 'dev', configFile: options.config })
  signal.throwIfAborted()
  const runtime = await createServer(context, { ...options, signal, isActive })
  return {
    ...runtime,
    context,
    get collectionOutcomes() { return runtime.collectionOutcomes },
  }
}
