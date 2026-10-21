import type { PreviewRuntimeStoryFile } from './preamble.js'

/**
 * Whether a module id can carry the cache-busting query of a hot update.
 *
 * Only real file modules do: a virtual id is resolved by the plugin that owns
 * it, and appending a query to it can make that resolution fail.
 */
function supportsModuleUrlVersion(moduleId: string) {
  return !moduleId.startsWith('virtual:') && !moduleId.startsWith('\0')
}

/**
 * Builds the emitted loader expression of one story module,
 * `version => import("<module id>")`.
 *
 * Loaders take an optional version: re-importing the same URL is served from the
 * browser's native module cache, so after a hot update the story's top-level
 * code — where module-scope `onTest(...)` definitions live — would never run
 * again and its tests would come back empty until a full reload.
 *
 * The import specifier goes through `JSON.stringify` so a module id containing
 * a quote, a backslash or a backtick cannot break out of its literal.
 * @param file Story file to emit a loader for.
 * @param options Loader options.
 * @param options.hmr Enables the cache-busting form (dev server only: a built
 * app has no hot updates, and the busted URL is not analyzable by the bundler).
 */
export function buildStoryModuleLoader(file: PreviewRuntimeStoryFile, { hmr = false } = {}) {
  const moduleId = JSON.stringify(file.moduleId)

  if (!hmr || !supportsModuleUrlVersion(file.moduleId)) {
    return `() => import(${moduleId})`
  }

  const versionQuery = JSON.stringify(`${file.moduleId.includes('?') ? '&' : '?'}hst-v=`)
  return `version => version ? import(/* @vite-ignore */ ${moduleId} + ${versionQuery} + version) : import(${moduleId})`
}
