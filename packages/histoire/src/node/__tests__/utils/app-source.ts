import { join, relative } from 'pathe'
import { listWorkspaceSourceFiles, readWorkspaceSource, readWorkspaceSourceEntries } from './workspace-source.js'

/** The `@histoire/app` package directory and the source tree the guards read. */
const PACKAGE_DIR = 'histoire-app'
const APP_SOURCE_ROOT = 'src'

/**
 * Reads one `@histoire/app` source file.
 *
 * A few app-side invariants (HMR listener cleanup, never posting to a wildcard
 * origin…) live in `.vue` single-file components or behind `import.meta.hot`,
 * neither of which this Node-side suite can execute, so they are pinned at the
 * source level instead.
 *
 * @param relativePath Path relative to `packages/histoire-app/src`.
 */
export function readAppSource(relativePath: string) {
  return readWorkspaceSource(PACKAGE_DIR, join(APP_SOURCE_ROOT, relativePath))
}

/**
 * Lists every TypeScript/Vue file of the app source tree.
 * @param relativeDir Sub-directory of `packages/histoire-app/src` to walk, defaults to all of it.
 * @returns Paths relative to `packages/histoire-app/src`.
 */
export function listAppSourceFiles(relativeDir = '.') {
  return listWorkspaceSourceFiles(PACKAGE_DIR, join(APP_SOURCE_ROOT, relativeDir))
    .map(path => relative(APP_SOURCE_ROOT, path))
}

/**
 * Reads a whole app sub-tree as `[path, source]` pairs, so an invariant that
 * must hold across the app keeps holding however its files are split or
 * renamed — instead of being pinned to the one path a refactor can move.
 *
 * @param relativeDir Sub-directory of `packages/histoire-app/src` to read.
 */
export function readAppSourceEntries(relativeDir = '.'): [string, string][] {
  return readWorkspaceSourceEntries(PACKAGE_DIR, join(APP_SOURCE_ROOT, relativeDir))
    .map(([path, source]) => [relative(APP_SOURCE_ROOT, path), source])
}
