import type { ModuleLoader } from '@histoire/shared'
import type { ViteDevServer } from 'vite'
import { resolve } from 'pathe'
import pc from 'picocolors'
import { ViteNodeRunner } from 'vite-node/client'
import { ViteNodeServer } from 'vite-node/server'

export interface UseModuleLoaderOptions {
  server: ViteDevServer
  throws?: boolean
}

let _load: ModuleLoader['loadModule']

export function useModuleLoader(options: UseModuleLoaderOptions): ModuleLoader {
  const { server } = options

  const node = new ViteNodeServer(server as any)

  const runner = new ViteNodeRunner({
    root: server.config.root,
    base: server.config.base,
    fetchModule: async id => node.fetchModule(id),
    resolveId: (id, importer) => node.resolveId(id, importer),
  })

  function clearCache() {
    server.moduleGraph.invalidateAll()
    node.fetchCache.clear()
    runner.moduleCache.clear()
  }

  async function loadModule(file: string) {
    try {
      const result = await runner.executeFile(resolve(file))
      return result
    }
    catch (e) {
      console.error(pc.red(`Error while loading module ${file}:\n${e.frame ? `${pc.bold(e.message)}\n${e.frame}` : e.stack}`))
      if (options.throws) {
        throw e
      }
    }
  }

  _load = loadModule

  async function destroy() {
    // Noop
  }

  return {
    clearCache,
    loadModule,
    destroy,
  }
}

export const loadModule: ModuleLoader['loadModule'] = (...args) => _load?.(...args)
