import type { Context } from '../context.js'
import { createRequire } from 'node:module'
import { join } from 'pathe'
import { hasProjectVitest } from '../util/has-vitest.js'

/**
 * Checks that the project (not Histoire) provides the browser test provider
 * packages, and fails with an actionable message instead of a raw
 * ERR_MODULE_NOT_FOUND stack.
 * @param root The project root to resolve from.
 */
export async function ensureBrowserTestDepsInstalled(root: string) {
  const missing = missingBrowserTestDependencies(root)
  if (missing.length) {
    throw new Error(
      `\`histoire test\` runs stories in a browser and requires ${missing.join(' and ')} in the project. `
      + `Install with: pnpm add -D ${missing.join(' ')}`,
    )
  }
}

/** Resolve optional browser peers from target project exactly as runner preflight does. */
export function missingBrowserTestDependencies(root: string): string[] {
  const projectRequire = createRequire(join(root, 'package.json'))
  const missing: string[] = []
  for (const dependency of ['@vitest/browser-playwright', 'playwright']) {
    try {
      projectRequire.resolve(dependency)
    }
    catch {
      missing.push(dependency)
    }
  }
  return missing
}

/**
 * Fails early when the project has no Vitest at all: every Histoire test runs
 * through the project's own Vitest browser mode.
 * @param ctx The histoire context.
 */
export function ensureProjectVitest(ctx: Context) {
  if (!hasProjectVitest(ctx.root)) {
    throw new Error('Vitest must be installed in the target project to run Histoire browser-mode tests.')
  }
}
