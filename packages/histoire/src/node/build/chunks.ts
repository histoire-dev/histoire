import type { Context } from '../context.js'
import { version as viteVersion } from 'vite'
import { isLazyBrowserDependency } from './lazy-dependencies.js'
import { hasVendorDependencyClosure } from './vendor-graph.js'

/** Module graph surface shared by Rollup and Rolldown chunk classifiers. */
interface ChunkGraph {
  /** Static dependencies only; dynamic edges retain their lazy ownership. */
  getModuleInfo: (id: string) => { importedIds: readonly string[] } | null
}

/** Preserve portable data and lazy engines while sharing dependency-closed vendors. */
export function createBuildChunkOutput(ctx: Context) {
  const embedEnabled = ctx.config.embed?.enabled ?? false
  /** Portable data must never inherit Vue or standalone UI side effects. */
  const isEmbedData = (id: string) => embedEnabled && (id.includes('@histoire/protocol') || id.includes('/histoire-protocol/') || id.includes('/fuse.js/'))
  /** Generated project imports cannot safely join a shared framework chunk. */
  const isVendorCandidate = (id: string) => !isLazyBrowserDependency(id) && !isEmbedData(id)
    && !id.includes('@histoire/app') && id.includes('node_modules')
    && !(ctx.config.build?.excludeFromVendorsChunk ?? []).some(test => typeof test === 'string' ? id.includes(test) : test.test(id))

  /** Missing or project-owned dependencies keep their natural execution boundaries. */
  function classify(id: string, graph: ChunkGraph) {
    if (isLazyBrowserDependency(id)) return
    if (isEmbedData(id)) return 'embed-data'
    if (hasVendorDependencyClosure(id, moduleId => graph.getModuleInfo(moduleId), isVendorCandidate)) return 'vendor'
  }

  if (Number.parseInt(viteVersion, 10) < 8) {
    return { onlyExplicitManualChunks: true, manualChunks: classify }
  }

  return {
    codeSplitting: {
      // Never absorb Vite helpers or lazy engines through recursive chunk capture.
      includeDependenciesRecursively: false,
      groups: [{
        debugName: 'histoire-shared',
        /** Rolldown supplies dependency lookups without whole-graph enumeration. */
        name: (id: string, graph: ChunkGraph) => classify(id, graph) ?? null,
      }],
    },
  }
}
