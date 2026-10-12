import { existsSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, normalize } from 'pathe'

const require = createRequire(import.meta.url)

/**
 * Resolves a module from the user project first, then from Histoire's own
 * dependency tree.
 *
 * Project-first is what keeps a single copy of a package in play: a story and
 * the runtime must share the very same `msw`/`vitest` instance, and Histoire's
 * own copy is only a fallback for projects that do not depend on it directly.
 * @param root The project root to resolve from first.
 * @param id The module id to resolve.
 * @param options Resolution options.
 * @param options.fallback Set to `false` to only accept the project's own install.
 * @returns The resolved path, or `null` when neither install has it.
 */
export function tryResolveDependency(root: string, id: string, options: { fallback?: boolean } = {}): string | null {
  const projectEntry = tryResolveProjectDependency(root, id)
  if (projectEntry || options.fallback === false) return projectEntry
  try {
    return require.resolve(id)
  }
  catch {
    return null
  }
}

/**
 * Resolves a bare module id strictly from the `node_modules` chain of `root`.
 *
 * Node's `require.resolve(id, { paths })` silently appends global lookup
 * folders (`NODE_PATH`, `~/.node_modules`, ...). pnpm bin shims export a
 * `NODE_PATH` pointing at the workspace's hoisted `.pnpm/node_modules`, so a
 * plain lookup could report Histoire's own dependencies as project ones. The
 * package directories are located first and the resolved entry must live in one.
 * @param root The project root whose ancestor `node_modules` folders are searched.
 * @param id The bare module id (optionally with a subpath) to resolve.
 * @returns The resolved path, or `null` when the project does not install it.
 */
function tryResolveProjectDependency(root: string, id: string): string | null {
  const resolveFromRoot = (): string | null => {
    try {
      return require.resolve(id, { paths: [root] })
    }
    catch {
      return null
    }
  }

  // Relative/absolute ids and Yarn PnP (no node_modules folders) can't leak
  // through global folders the same way, so keep Node's own resolution there.
  if (id.startsWith('.') || isAbsolute(id) || process.versions.pnp) return resolveFromRoot()

  const packageDirectories = findProjectPackageDirectories(root, getPackageName(id))
  if (!packageDirectories.length) return null
  const resolved = resolveFromRoot()
  if (!resolved) return null
  // A broken project copy can make Node fall through to a global folder: only
  // accept entries inside a located package (symlinked or real path, since
  // pnpm stores may live outside the project).
  const normalized = normalize(resolved)
  const allowed = packageDirectories.flatMap(directory => [directory, normalize(realpathSync(directory))])
  return allowed.some(directory => normalized.startsWith(`${directory}/`)) ? resolved : null
}

/**
 * Lists existing `node_modules/<packageName>` folders in the ancestor chain of
 * `root`, i.e. the lookup locations Node tries before global folders.
 * @param root Directory to start searching from.
 * @param packageName Package name, possibly scoped.
 */
export function findProjectPackageDirectories(root: string, packageName: string): string[] {
  const found: string[] = []
  let directory = normalize(root)
  while (true) {
    // Node skips `node_modules/node_modules` candidates.
    if (!directory.endsWith('/node_modules')) {
      const candidate = join(directory, 'node_modules', packageName)
      if (existsSync(candidate)) found.push(candidate)
    }
    const parent = dirname(directory)
    if (parent === directory) return found
    directory = parent
  }
}

/**
 * Extracts the package name from a bare module id (`@scope/name/sub` gives `@scope/name`).
 * @param id Bare module id.
 */
function getPackageName(id: string): string {
  const segments = id.split('/')
  return id.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0]
}

/**
 * Expands dependency ids with their resolved install directory so Vite's
 * dependency optimizer picks up both the bare id and the on-disk package.
 * @param deps Bare dependency ids.
 */
export function withPackageDirs(deps: Iterable<string>): string[] {
  const result: string[] = []

  for (const dep of deps) {
    result.push(dep)
    try {
      result.push(dirname(require.resolve(`${dep}/package.json`)))
    }
    catch {
      // Not resolvable from here (a node-only or type-only package): the bare
      // id alone is enough for Vite to warn about it and move on.
    }
  }

  return result
}
