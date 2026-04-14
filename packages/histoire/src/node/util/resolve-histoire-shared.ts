import fs from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'pathe'

const require = createRequire(import.meta.url)

/**
 * Resolves the local `@histoire/shared` runtime entry.
 *
 * Published installs expose `dist/index.js`, but the workspace test suite can
 * run before that package has been built. In that case, fall back to the
 * source entry so browser-runtime helpers still resolve cleanly.
 */
export function resolveHistoireSharedEntry() {
  const packageJsonPath = require.resolve('@histoire/shared/package.json')
  const packageRoot = dirname(packageJsonPath)
  const builtEntry = resolve(packageRoot, 'dist/index.js')

  if (fs.existsSync(builtEntry)) {
    return builtEntry
  }

  const sourceEntry = resolve(packageRoot, 'src/index.ts')
  if (fs.existsSync(sourceEntry)) {
    return sourceEntry
  }

  return builtEntry
}
