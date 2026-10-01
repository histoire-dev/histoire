import { join, relative } from 'pathe'
import { listWorkspaceSourceFiles, readWorkspaceSource, readWorkspaceSources } from './workspace-source.js'

/** This package's directory name and the source tree the guards look at. */
const PACKAGE_DIR = 'histoire'
const NODE_SOURCE_ROOT = 'src/node'

/**
 * Reads one node-side source file.
 *
 * A handful of invariants (never `await import(<absolute path>)`, never
 * `force: true` on the dep optimizer…) cannot be observed from the outside
 * without spinning a real browser run, so they are pinned at the source level.
 * @param relativePath Path relative to `src/node`.
 */
export function readNodeSource(relativePath: string) {
  return readWorkspaceSource(PACKAGE_DIR, join(NODE_SOURCE_ROOT, relativePath))
}

/**
 * Lists every TypeScript file of the node-side source tree, tests excluded.
 * @param relativeDir Sub-directory of `src/node` to walk, defaults to all of it.
 * @returns Paths relative to `src/node`.
 */
export function listNodeSourceFiles(relativeDir = '.') {
  return listWorkspaceSourceFiles(PACKAGE_DIR, join(NODE_SOURCE_ROOT, relativeDir))
    .map(path => relative(NODE_SOURCE_ROOT, path))
}

/**
 * Concatenates the sources of a whole node-side sub-tree, so an invariant that
 * must hold for a feature keeps holding however its files are split.
 * @param relativeDir Sub-directory of `src/node` to read.
 */
export function readNodeSources(relativeDir: string) {
  return readWorkspaceSources(PACKAGE_DIR, join(NODE_SOURCE_ROOT, relativeDir))
}
