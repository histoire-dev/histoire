import fs from 'node:fs'
import { join, relative, resolve } from 'pathe'

/**
 * Absolute path of the monorepo `packages/` directory, derived from the package
 * this suite runs in (`packages/histoire`).
 */
const PACKAGES_ROOT = resolve(process.cwd(), '..')

/** Source extensions the walkers pick up. */
const SOURCE_EXTENSIONS = ['.ts', '.vue']

/**
 * Reads one source file of a workspace package.
 *
 * A handful of invariants cannot be observed from the outside without a
 * browser, a Vite dev server or an SFC compiler (`import.meta.hot` wiring,
 * `.vue` templates, generated-source escaping…), so they are pinned at the
 * source level. Every such spec goes through these helpers rather than its own
 * `fs.readFileSync`, so the paths stay in one place.
 *
 * @param packageDir Directory name under `packages/`, e.g. `histoire-app`.
 * @param relativePath Path relative to that package's directory.
 */
export function readWorkspaceSource(packageDir: string, relativePath: string) {
  return fs.readFileSync(join(PACKAGES_ROOT, packageDir, relativePath), 'utf8')
}

/**
 * Lists every source file of a workspace package sub-tree, tests excluded.
 *
 * @param packageDir Directory name under `packages/`.
 * @param relativeDir Sub-directory of that package to walk.
 * @returns Paths relative to `relativeDir`'s parent package directory.
 */
export function listWorkspaceSourceFiles(packageDir: string, relativeDir: string) {
  const packageRoot = join(PACKAGES_ROOT, packageDir)
  const files: string[] = []

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__' && entry.name !== 'node_modules') {
          walk(entryPath)
        }
      }
      else if (SOURCE_EXTENSIONS.some(extension => entry.name.endsWith(extension))) {
        files.push(relative(packageRoot, entryPath))
      }
    }
  }

  walk(join(packageRoot, relativeDir))

  return files.sort()
}

/**
 * Reads a whole package sub-tree as `[path, source]` pairs, so an invariant
 * that must hold across a feature keeps holding however its files are split or
 * renamed — instead of being pinned to the one path a refactor can move.
 *
 * @param packageDir Directory name under `packages/`.
 * @param relativeDir Sub-directory of that package to read.
 */
export function readWorkspaceSourceEntries(packageDir: string, relativeDir: string): [string, string][] {
  return listWorkspaceSourceFiles(packageDir, relativeDir)
    .map(path => [path, readWorkspaceSource(packageDir, path)] as [string, string])
}

/**
 * Concatenates the sources of a whole package sub-tree.
 *
 * @param packageDir Directory name under `packages/`.
 * @param relativeDir Sub-directory of that package to read.
 */
export function readWorkspaceSources(packageDir: string, relativeDir: string) {
  return readWorkspaceSourceEntries(packageDir, relativeDir).map(([, source]) => source).join('\n')
}
