import type { ModuleLoader } from '@histoire/shared'
import type { ViteDevServer } from 'vite'
import { readFile } from 'node:fs/promises'
import { isAbsolute, resolve } from 'pathe'
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
  const cssResolver = server.config.createResolver({ extensions: ['.css', '.pcss', '.postcss'], mainFields: ['style'], conditions: ['style'] })

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

  /** Prefer CSS package exports while preserving Vite aliases and virtual modules. */
  async function resolveId(id: string, importer?: string) {
    if (importer && /\.(?:css|pcss|postcss)$/.test(importer)) {
      const css = await cssResolver(id, importer)
      if (css) return css
    }
    return (await server.pluginContainer.resolveId(id, importer))?.id ?? null
  }

  /** Load plugin-authored raw CSS rather than Vite's browser JS representation. */
  async function loadSource(id: string) {
    const loaded = await server.pluginContainer.load(id)
    const code = typeof loaded === 'string' ? loaded : loaded && loaded.code
    return { code: code ?? await readFile(id, 'utf8'), dependencies: getDependencies(id) }
  }

  /** Follow module graph and vite-node imports without traversing cycles twice. */
  function getDependencies(id: string): string[] {
    const visited = new Set<string>()
    const pending = [id]
    while (pending.length) {
      const current = pending.pop()!
      if (visited.has(current)) continue
      visited.add(current)
      for (const module of server.moduleGraph.getModuleById(current)?.importedModules ?? []) {
        if (module.id) pending.push(module.id)
      }
      for (const imported of runner.moduleCache.get(current)?.imports ?? []) pending.push(imported)
    }
    return [...visited].filter(file => isAbsolute(file) && !file.includes('?'))
  }

  return {
    clearCache,
    loadModule,
    destroy,
    resolveId,
    loadSource,
    getDependencies,
  }
}

export const loadModule: ModuleLoader['loadModule'] = (...args) => _load?.(...args)
