import { createRequire } from 'node:module'
import { dirname, resolve } from 'pathe'

const require = createRequire(import.meta.url)

/**
 * Resolves the directory of the bundled `@histoire/app` build.
 *
 * The preview runtime is a virtual module, so it has no location on disk: a
 * bare `@histoire/app/...` specifier in it is resolved from the *user's*
 * project root, where only `histoire` is a dependency. Resolving from this
 * package instead — which does depend on `@histoire/app` — makes the generated
 * runtime build in any project, whatever the node_modules layout.
 */
export function resolveHistoireAppBundledDir() {
  const packageJsonPath = require.resolve('@histoire/app/package.json')
  return resolve(dirname(packageJsonPath), 'dist/bundled')
}
