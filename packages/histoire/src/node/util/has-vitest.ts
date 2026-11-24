import { tryResolveDependency } from './resolve-package.js'

/**
 * Returns true when Vitest is resolvable from the project root.
 *
 * Uses real module resolution so it works in hoisted/monorepo installs where
 * vitest is declared at the workspace root rather than the project's own
 * package.json. A package.json declaration alone is insufficient: users may not
 * have run their package manager yet, or an install may be incomplete.
 *
 * Histoire's own copy never counts: pnpm bin shims export a `NODE_PATH` holding
 * Histoire's dependencies, which Vite cannot resolve from the project.
 */
export function hasProjectVitest(root: string) {
  // `vitest/node` is what histoire actually imports; fall back to `vitest`.
  return ['vitest/node', 'vitest'].some(id => tryResolveDependency(root, id, { fallback: false }) !== null)
}
