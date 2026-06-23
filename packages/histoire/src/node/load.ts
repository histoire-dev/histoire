import type { ModuleLoader } from '@histoire/shared'
import type { ViteDevServer } from 'vite'
import { resolve } from 'pathe'
import pc from 'picocolors'
import { createServerModuleRunner } from 'vite'

export interface UseModuleLoaderOptions {
  server: ViteDevServer
  throws?: boolean
}

let _load: ModuleLoader['loadModule']

export function useModuleLoader(options: UseModuleLoaderOptions): ModuleLoader {
  const { server } = options

  const runner = createServerModuleRunner(server.environments.ssr, {
    hmr: false,
  })

  function clearCache() {
    server.moduleGraph.invalidateAll()
    runner.clearCache()
  }

  async function loadModule(file: string) {
    try {
      const result = await runner.import(resolve(file))
      return result
    }
    catch (e) {
      console.error(pc.red(`Error while loading module ${file}:\n${formatError(e)}`))
      if (options.throws) {
        throw e
      }
    }
  }

  _load = loadModule

  async function destroy() {
    await runner.close()
  }

  return {
    clearCache,
    loadModule,
    destroy,
  }
}

export const loadModule: ModuleLoader['loadModule'] = (...args) => _load?.(...args)

function formatError(error: unknown) {
  const e = error as Error & { frame?: string }
  return e.frame ? `${pc.bold(e.message)}\n${e.frame}` : e.stack ?? e.message ?? String(error)
}
