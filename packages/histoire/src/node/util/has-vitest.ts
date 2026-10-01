import { createRequire } from 'node:module'
import { resolve } from 'pathe'

/**
 * Checks whether the `vitest` package can be resolved from the project root.
 *
 * Uses real module resolution so it works in hoisted/monorepo installs where
 * vitest is declared at the workspace root rather than the project's own
 * package.json.
 */
function canResolveVitest(root: string) {
  try {
    const require = createRequire(resolve(root, 'package.json'))
    // `vitest/node` is what histoire actually imports; fall back to `vitest`.
    try {
      require.resolve('vitest/node')
      return true
    }
    catch {
      require.resolve('vitest')
      return true
    }
  }
  catch {
    return false
  }
}

/**
 * Returns true when Vitest is resolvable from the project root.
 * A package.json declaration alone is insufficient: users may not have run
 * their package manager yet, or an install may be incomplete.
 */
export function hasProjectVitest(root: string) {
  return canResolveVitest(root)
}
