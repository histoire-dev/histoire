import fs from 'node:fs'
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
 * Checks whether the project lists `vitest` in its own package.json.
 *
 * Kept as a secondary signal — module resolution above is authoritative.
 */
function isVitestDeclared(root: string) {
  try {
    const packageJson = JSON.parse(fs.readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }

    return Boolean(
      packageJson.dependencies?.vitest
      || packageJson.devDependencies?.vitest,
    )
  }
  catch {
    return false
  }
}

/**
 * Returns true when Vitest is available for the given project root, either
 * because it is declared in package.json or because it is resolvable (e.g.
 * hoisted to the workspace root in a monorepo).
 */
export function hasProjectVitest(root: string) {
  return isVitestDeclared(root) || canResolveVitest(root)
}
