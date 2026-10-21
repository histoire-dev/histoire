import type { DevEnvironment, ViteDevServer, Plugin as VitePlugin } from 'vite'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { dirname, join } from 'pathe'

/**
 * Prefix of the `v` query value Histoire puts on its own built modules. Vite
 * serves any module URL carrying a `v=` query with an immutable cache policy;
 * the prefix tells these versions apart from dependency optimizer versions,
 * which change whenever the optimizer reruns.
 */
const VERSION_PREFIX = 'hst-'

/**
 * Files that tolerate a version query. Other types (JSON, assets) go through
 * transforms whose id filters reject unknown queries and would be served raw.
 */
const VERSIONABLE_RE = /\.(?:m?js|css)$/

/** Matches a `v=` query parameter (same shape as Vite's own dep version check). */
const VERSION_QUERY_RE = /[?&]v=[\w.-]+/

/**
 * Whether a module URL carries a version added by {@link createModuleVersioner}.
 * @param url Browser module URL.
 */
export function isHistoireModuleVersionUrl(url: string): boolean {
  return url.includes(`v=${VERSION_PREFIX}`)
}

/** Owning package of a directory: its root and manifest name. */
interface PackageInfo {
  root: string
  name: string | undefined
}

/**
 * Whether a package name belongs to Histoire itself.
 * @param name Package manifest name.
 */
function isHistoirePackage(name: string | undefined): boolean {
  return name === 'histoire' || !!name?.startsWith('@histoire/')
}

/**
 * Hashes the path, size and modification time of every file below `dir`. A
 * rebuilt package therefore gets a new version (and new browser URLs) without
 * reading file contents.
 * @param dir Built output directory.
 */
function hashDirectory(dir: string): string {
  const hash = createHash('sha1')
  const visit = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) {
        visit(path)
      }
      else if (entry.isFile()) {
        const stat = fs.statSync(path)
        hash.update(`${path}\0${stat.size}\0${stat.mtimeMs}\n`)
      }
    }
  }
  visit(dir)
  return hash.digest('hex').slice(0, 10)
}

/**
 * Creates a function adding a stable `?v=hst-<hash>` query to resolved ids of
 * modules built into the `dist/` directory of a Histoire package.
 *
 * Every sandbox iframe is its own document and imports the same ~200 Histoire
 * modules. In a monorepo or linked install those files resolve outside
 * `node_modules`, so Vite serves them `no-cache` and each document revalidates
 * every one of them. Versioned URLs are served immutable instead, so later
 * documents read them from the browser cache without a request.
 *
 * An existing `v=` query (Vite versions excluded deps in `node_modules` with
 * the optimizer hash) is replaced: every import of one file must produce the
 * same URL, or the browser would evaluate two copies of the module. Ids with
 * any other query (`?inline`, `?url`, ...) and non-script/style files are left
 * alone.
 *
 * The `salt` takes part in the version. A built module's transformed code
 * embeds the URLs of what it imports, optimized dependencies included, so it
 * may only stay cached while those URLs hold (see {@link getVersionSalt}).
 *
 * Package lookups and directory hashes are memoized for the versioner's
 * lifetime, so create one per dev server.
 */
export function createModuleVersioner(): (id: string, salt?: string) => string {
  const packageByDir = new Map<string, PackageInfo | null>()
  const hashByRoot = new Map<string, string>()

  /** Nearest package owning `dir`, walking up to the filesystem root. */
  function findPackage(dir: string): PackageInfo | null {
    const cached = packageByDir.get(dir)
    if (cached !== undefined) return cached
    let info: PackageInfo | null = null
    const manifest = join(dir, 'package.json')
    if (fs.existsSync(manifest)) {
      let name: string | undefined
      try {
        name = JSON.parse(fs.readFileSync(manifest, 'utf8')).name
      }
      catch {}
      info = { root: dir, name }
    }
    else {
      const parent = dirname(dir)
      info = parent === dir ? null : findPackage(parent)
    }
    packageByDir.set(dir, info)
    return info
  }

  return (id, salt = '') => {
    if (id.startsWith('\0') || !id.startsWith('/')) return id
    const queryIndex = id.indexOf('?')
    const file = queryIndex === -1 ? id : id.slice(0, queryIndex)
    const query = queryIndex === -1 ? '' : id.slice(queryIndex)
    if (!VERSIONABLE_RE.test(file) || (query && query.replace(VERSION_QUERY_RE, '') !== '')) return id

    const info = findPackage(dirname(file))
    if (!info || !isHistoirePackage(info.name)) return id
    const dist = `${info.root}/dist`
    if (!file.startsWith(`${dist}/`)) return id

    let hash = hashByRoot.get(info.root)
    if (!hash) {
      hash = hashDirectory(dist)
      hashByRoot.set(info.root, hash)
    }
    const version = salt ? createHash('sha1').update(`${hash}\0${salt}`).digest('hex').slice(0, 10) : hash
    return `${file}?v=${VERSION_PREFIX}${version}`
  }
}

/**
 * Salt of {@link createModuleVersioner} for one client environment: its
 * optimizer cache directory (unique per Histoire run) and browser hash.
 *
 * Built modules import optimized dependencies (`vue`, ...) through URLs under
 * that directory. Without the salt, a browser keeping an immutable module from
 * an earlier run would import that run's dependency copy next to the current
 * one — two Vue instances in one document. A dependency re-optimization that
 * changes the browser hash invalidates the whole module graph and reloads the
 * page, so every import is resolved again with the new salt.
 * @param environment Client dev environment.
 */
export function getVersionSalt(environment: DevEnvironment): string {
  return `${environment.config.cacheDir}\0${environment.depsOptimizer?.metadata.browserHash ?? ''}`
}

/** Versioner of each dev server running {@link createModuleVersionPlugin}. */
const serverVersioners = new WeakMap<ViteDevServer, ReturnType<typeof createModuleVersioner>>()

/**
 * Versions a file path the way module resolution on `server` does, for URLs
 * written by hand into HTML documents. Identity when the server does not run
 * {@link createModuleVersionPlugin}.
 * @param server Dev server serving the URL.
 * @param file Absolute file path.
 */
export function versionModuleFile(server: ViteDevServer, file: string): string {
  return serverVersioners.get(server)?.(file, getVersionSalt(server.environments.client)) ?? file
}

/**
 * Dev-only plugin serving Histoire's built browser modules under versioned,
 * immutable URLs (see {@link createModuleVersioner}). It wraps resolution of
 * every client import, so static imports, dynamic imports and HTML entries
 * all agree on one URL per file.
 */
export function createModuleVersionPlugin(): VitePlugin {
  let version = createModuleVersioner()
  return {
    name: 'histoire:module-version',
    enforce: 'pre',
    apply: 'serve',
    configureServer(server) {
      // A restarted server may run against rebuilt packages.
      version = createModuleVersioner()
      serverVersioners.set(server, version)
    },
    async resolveId(source, importer, options) {
      // The optimizer scan and server-side environments never reach a browser.
      if ((options as { scan?: boolean }).scan || this.environment?.config.consumer !== 'client') return null
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
      if (!resolved || resolved.external) return resolved
      const id = version(resolved.id, getVersionSalt(this.environment as DevEnvironment))
      return id === resolved.id ? resolved : { ...resolved, id }
    },
  }
}
