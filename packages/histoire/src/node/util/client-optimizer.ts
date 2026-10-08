import type { DevEnvironment } from 'vite'
import { parseAst } from 'rollup/dist/parseAst.js'
import { analyzeCollectionModule } from '../test/eligibility/analysis.js'
import { debugVitestBrowser } from './browser-debug.js'

/** Warm static runtime imports; entry scanning owns literal dynamic dependencies without loading unused UI. */
export async function warmClientModules(client: DevEnvironment, entries: string[]): Promise<ReadonlyMap<string, readonly string[]>> {
  const visited = new Set<string>()
  const graph = new Map<string, readonly string[]>()
  /** Root stories are admitted separately because generated harness loaders use dynamic imports. */
  async function warm(url: string): Promise<void> {
    if (visited.has(url) || !url.startsWith('/')) return
    visited.add(url)
    try {
      const module = await client.transformRequest(url.replace('/@id/__x00__', '\0'))
      if (!module) return
      // Owned loader modules enumerate admitted stories, support runtimes and
      // setup files. Other lazy UI remains cold until a mounted target needs it.
      const staticImports = parseAst(module.code).body.flatMap(node => ('source' in node && node.source?.type === 'Literal' && typeof node.source.value === 'string') ? [node.source.value] : [])
      graph.set(url, staticImports)
      const imports = url.includes('virtual:$histoire-') ? analyzeCollectionModule(module.code).imports : staticImports
      await Promise.all(imports.map(warm))
    }
    catch (error) { debugVitestBrowser('collection:client-warmup', error instanceof Error ? error.message : error) }
  }
  await Promise.all(entries.map(warm))
  await client.waitForRequestsIdle()
  return graph
}

/** Preload static app modules only; lazy story imports and optimizer-version URLs stay excluded. */
export function getStaticClientPreloads(graph: ReadonlyMap<string, readonly string[]>, entries: string[]): string[] {
  const urls = new Set<string>()
  /** Cycles and shared imports yield one hint without admitting lazy story modules. */
  function visit(url: string) {
    if (urls.has(url) || !graph.has(url) || /[?&]v=/.test(url)) return
    urls.add(url)
    for (const dependency of graph.get(url)!) visit(dependency)
  }
  entries.forEach(visit)
  return [...urls]
}

/** Finish initial optimization before any tester can race dependency export interop. */
export async function finishClientOptimization(client: DevEnvironment): Promise<void> {
  const optimizer = client.depsOptimizer
  if (!optimizer) return
  await optimizer.init()
  await optimizer.scanProcessing
  optimizer.run()
  await Promise.all(Object.values(optimizer.metadata.discovered).map(dependency => dependency.processing))
}
