import { createRequire } from 'node:module'
import { tryResolveDependency } from './resolve-package.js'

/**
 * Locates the Vitest install every browser runtime resolves against: the
 * project's own copy, falling back to Histoire's.
 * @param root The project root.
 * @throws When no Vitest install can be found at all.
 */
function resolveVitestPackageJson(root: string) {
  const resolved = tryResolveDependency(root, 'vitest/package.json')
  if (!resolved) {
    throw new Error(`Cannot resolve "vitest" from ${root} nor from Histoire's own dependencies.`)
  }
  return resolved
}

/**
 * Resolves a module through the project's Vitest install, so a single copy of
 * Vitest and its internals is used everywhere.
 * @param root The project root.
 * @param id The module id to resolve.
 */
export function resolveVitestModule(root: string, id: string) {
  const vitestPackageJson = resolveVitestPackageJson(root)
  return createRequire(vitestPackageJson).resolve(id)
}

/**
 * Same as {@link resolveVitestModule}, returning `null` instead of throwing for
 * an optional module (a project without Vitest, or without that Vitest entry).
 * @param root The project root.
 * @param id The module id to resolve.
 */
export function tryResolveVitestModule(root: string, id: string) {
  try {
    return resolveVitestModule(root, id)
  }
  catch {
    return null
  }
}
