/** Static import information exposed by Rollup after module graph resolution. */
interface VendorModuleInfo {
  /** Only static edges participate; dynamic imports preserve lazy ownership. */
  importedIds: readonly string[]
}

/**
 * Checks whether a module and its static dependencies are safe to share in the
 * vendor chunk. Vite 8's Rolldown callback exposes dependency lookups but does
 * not expose whole-graph enumeration, so this walks from the requested module.
 */
export function hasVendorDependencyClosure(
  id: string,
  getModuleInfo: (id: string) => VendorModuleInfo | null,
  isCandidate: (id: string) => boolean,
): boolean {
  const pending = [id]
  const visited = new Set<string>()
  while (pending.length) {
    const moduleId = pending.pop()!
    if (visited.has(moduleId)) continue
    visited.add(moduleId)
    if (!isCandidate(moduleId)) return false
    const module = getModuleInfo(moduleId)
    // A missing module cannot prove its dependency closure. Keep it out of
    // vendor so the bundler preserves its natural ownership.
    if (!module) return false
    pending.push(...module.importedIds)
  }
  return true
}

/**
 * Admit only dependency-closed vendor modules. Forcing a package that imports
 * generated project modules into vendor can create a chunk initialization cycle
 * with Vue or other neutral dependencies. Reverse propagation also handles
 * strongly connected imports without recursive traversal or partial memoization.
 */
export function createVendorModuleSet(
  moduleIds: Iterable<string>,
  getModuleInfo: (id: string) => VendorModuleInfo | null,
  isCandidate: (id: string) => boolean,
): Set<string> {
  const admitted = new Set<string>()
  const importers = new Map<string, string[]>()
  const blocked = new Set<string>()
  for (const id of moduleIds) {
    if (isCandidate(id)) admitted.add(id)
    else blocked.add(id)
    for (const dependency of getModuleInfo(id)?.importedIds ?? []) {
      const parents = importers.get(dependency) ?? []
      parents.push(id)
      importers.set(dependency, parents)
      if (!isCandidate(dependency)) blocked.add(dependency)
    }
  }
  const queue = [...blocked]
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index]
    admitted.delete(id)
    for (const importer of importers.get(id) ?? []) {
      if (blocked.has(importer)) continue
      blocked.add(importer)
      queue.push(importer)
    }
  }
  return admitted
}
