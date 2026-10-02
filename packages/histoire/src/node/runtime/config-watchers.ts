import type { ProjectRuntimeDependencies } from './types.js'
import chokidar from 'chokidar'
import { resolveConfigFile } from '../config/index.js'
import { createCleanupStack } from './cleanup.js'

/** Owns all configuration watchers for one runtime generation. */
export const watchProjectConfiguration: ProjectRuntimeDependencies['watch'] = async (runtime, options, restart) => {
  const cleanup = createCleanupStack()
  let stopped = false
  try {
    const histoireFile = await resolveConfigFile(runtime.context.root, options.config)
    const files = new Map<string, string>()
    if (runtime.viteConfigFile) files.set(runtime.viteConfigFile, 'Vite')
    if (histoireFile) files.set(histoireFile, 'Histoire')
    for (const [file, source] of files) {
      const watcher = chokidar.watch(file, { ignoreInitial: true })
      cleanup.add(() => watcher.close())
      watcher.on('change', () => {
        if (!stopped) restart(source)
      })
      watcher.on('error', (error) => {
        if (!stopped) options.onError?.(error)
      })
    }
    return () => {
      stopped = true
      return cleanup.close()
    }
  }
  catch (error) {
    stopped = true
    await cleanup.close()
    throw error
  }
}
