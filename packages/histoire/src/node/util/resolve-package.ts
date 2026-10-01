import { createRequire } from 'node:module'
import { dirname } from 'pathe'

const require = createRequire(import.meta.url)

/**
 * Resolves a module from the user project first, then from Histoire's own
 * dependency tree.
 *
 * Project-first is what keeps a single copy of a package in play: a story and
 * the runtime must share the very same `msw`/`vitest` instance, and Histoire's
 * own copy is only a fallback for projects that do not depend on it directly.
 * @param root The project root to resolve from first.
 * @param id The module id to resolve.
 * @returns The resolved path, or `null` when neither install has it.
 */
export function tryResolveDependency(root: string, id: string): string | null {
  try {
    return require.resolve(id, {
      paths: [root],
    })
  }
  catch {
    try {
      return require.resolve(id)
    }
    catch {
      return null
    }
  }
}

/**
 * Expands dependency ids with their resolved install directory so Vite's
 * dependency optimizer picks up both the bare id and the on-disk package.
 * @param deps Bare dependency ids.
 */
export function withPackageDirs(deps: Iterable<string>): string[] {
  const result: string[] = []

  for (const dep of deps) {
    result.push(dep)
    try {
      result.push(dirname(require.resolve(`${dep}/package.json`)))
    }
    catch {
      // Not resolvable from here (a node-only or type-only package): the bare
      // id alone is enough for Vite to warn about it and move on.
    }
  }

  return result
}
