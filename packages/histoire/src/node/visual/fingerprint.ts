import type { HistoireVisualCase } from '@histoire/shared'
import type { VisualSource } from './source.js'
import { lstat, readdir, readFile, realpath } from 'node:fs/promises'
import { createRequire, isBuiltin } from 'node:module'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { searchForWorkspaceRoot } from 'vite'
import { parseConfigCode } from '../config/codemod/parse.js'
import { resolveConfigFile } from '../config/load.js'
import { resolveBrowserSetupDriverIdentity } from '../runtime/browser/setup/driver.js'
import { readVisualPublicationFile } from './files.js'
import { stableVisualJson, visualHash } from './identity.js'

/** Bounded content manifest, independent of runtime generation and HTTP port. */
export interface VisualFingerprint {
  /** Absolute trusted file paths and their content hashes. */
  files: Record<string, string>
  /** Public assets, including additions and removals. */
  assets: Record<string, string>
  /** Plugin-owned virtual modules whose loader output can be reproduced. */
  virtual: Record<string, string>
  /** Resolved environment, renderer policy, and runtime identity hash. */
  runtime: string
  /** Unverifiable input prevents approval but leaves images reviewable. */
  reason?: string
}

/** Shared hashes are scoped to one approval request; final fence always rereads contents. */
export function createVisualFingerprintValidation() {
  const reads = new Map<string, Promise<unknown>>()
  return {
    /** Evidence successfully validated in this request, never trusted across requests. */
    validated: new WeakSet<VisualFingerprint>(),
    /** Deduplicate shared inputs without relying on modification times. */
    read<T>(key: string, operation: () => Promise<T>): Promise<T> {
      if (!reads.has(key)) reads.set(key, operation())
      return reads.get(key)! as Promise<T>
    },
  }
}

/** Internal request-scoped source validation memo. */
export type VisualFingerprintValidation = ReturnType<typeof createVisualFingerprintValidation>

/** Canonical roots come from current trusted Vite configuration, never cached metadata. */
async function roots(source: VisualSource): Promise<string[]> {
  const paths = [source.ctx.root, ...(source.server.config.server.fs?.allow ?? []), searchForWorkspaceRoot(dirname(fileURLToPath(new URL('../../../package.json', import.meta.url))))]
  return [...new Set(await Promise.all(paths.map(path => realpath(path))))]
}

/** Read bounded regular source files only within currently trusted roots. */
async function content(path: string, allowed: string[]): Promise<string> {
  const canonical = await realpath(path)
  if (!allowed.some(root => canonical === root || canonical.startsWith(`${root}${sep}`))) throw new Error('Source dependency outside trusted workspace')
  const stat = await lstat(canonical)
  if (!stat.isFile() || stat.size > 8 * 1024 * 1024) throw new Error('Source dependency exceeds recovery limits')
  return visualHash(await readFile(canonical))
}

/** Public asset inventory detects new files as well as changed referenced images. */
async function assets(source: VisualSource, allowed: string[]): Promise<Record<string, string>> {
  const values: Record<string, string> = {}
  const root = source.server.config.publicDir
  if (!root) return values
  /** Directory traversal remains bounded and refuses asset symlinks. */
  async function visit(path: string): Promise<void> {
    const entries = await readdir(path, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return []
      throw error
    })
    for (const entry of entries) {
      if (Object.keys(values).length >= 4096 || entry.isSymbolicLink()) throw new Error('Public assets cannot be revalidated')
      const file = join(path, entry.name)
      if (entry.isDirectory()) await visit(file)
      else values[file] = await content(file, allowed)
    }
  }
  await visit(root)
  return values
}

/** Metadata-only browser discovery: restoring results never launches Chromium. */
async function runtime(source: VisualSource): Promise<string> {
  const driver = await resolveBrowserSetupDriverIdentity(source.ctx.root)
  const config = source.server.config
  return visualHash(stableVisualJson({ node: process.versions.node, platform: `${process.platform}-${process.arch}`, browser: source.ctx.config.browser ?? null, driver: driver.status === 'available' ? driver.identity : driver.status, env: config.env ?? {}, define: config.define ?? {}, setup: source.ctx.config.setupFile ?? null }))
}

/** Capture transitive client inputs and trusted config imports without executing them. */
export async function fingerprintVisualSource(source: VisualSource, item: HistoireVisualCase, resourceFiles: string[] = []): Promise<VisualFingerprint> {
  const files: Record<string, string> = {}
  const result: VisualFingerprint = { files, assets: {}, virtual: {}, runtime: '' }
  try {
    const allowed = await roots(source)
    const story = source.ctx.storyFiles.find(file => file.story?.id === item.storyId)
    if (!story) throw new Error('Source story unavailable')
    const entry = story.path ?? resolve(source.ctx.root, story.relativePath)
    if (entry.includes(`${sep}.histoire${sep}`)) result.reason = 'Generated story source cannot be revalidated'
    const configFile = resolveConfigFile(source.ctx.root, source.ctx.configFile)
    const setup = source.ctx.config.setupFile
    const setupFiles = typeof setup === 'string' ? [setup] : Object.values(setup ?? {})
    const pending = [entry, ...resourceFiles, ...setupFiles.filter(Boolean).map(file => resolve(source.ctx.root, file)), ...(configFile ? [configFile] : []), ...(source.server.config.configFileDependencies ?? []), fileURLToPath(new URL('../../../package.json', import.meta.url))]
    // Workspace manifests and lockfiles matter even when no Git checkout exists.
    for (let path = source.ctx.root; ; path = dirname(path)) {
      for (const name of ['package.json', 'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', '.env', '.env.local', '.env.development', '.env.development.local']) {
        const file = join(path, name)
        if (await lstat(file).then(stat => stat.isFile()).catch(() => false)) pending.push(file)
      }
      if (dirname(path) === path || !allowed.some(root => dirname(path) === root || dirname(path).startsWith(`${root}${sep}`))) break
    }
    const visited = new Set<string>()
    while (pending.length) {
      const id = pending.pop()!
      if (visited.has(id)) continue
      visited.add(id)
      if (visited.size > 4096) throw new Error('Source dependency inventory exceeds recovery limits')
      if (id.startsWith('\0') || id.startsWith('virtual:')) {
        if (!id.includes('histoire')) {
          const loaded = await source.server.pluginContainer.load(id)
          const code = typeof loaded === 'string' ? loaded : loaded && loaded.code
          if (code === undefined) result.reason = 'Plugin-generated source cannot be revalidated'
          else result.virtual[id] = visualHash(code)
        }
        continue
      }
      if (!isAbsolute(id)) {
        result.reason = 'External source cannot be revalidated'
        continue
      }
      const path = id.split('?')[0]
      if (path.includes(`${sep}.histoire${sep}`) || path.includes(`${sep}${source.ctx.config.visual?.baselineDir ?? '.histoire-visual'}${sep}`)) continue
      files[path] = await content(path, allowed)
      for (const module of source.server.moduleGraph.getModulesByFile(path) ?? []) {
        for (const dependency of module.importedModules) {
          if (dependency.id) pending.push(dependency.id)
        }
      }
      // Config/setup imports can be absent from client graph. Reuse existing TS parser.
      if (/\.[cm]?[jt]s$/.test(path) && !path.includes(`${sep}node_modules${sep}`)) {
        const parsed = parseConfigCode(await readFile(path, 'utf8'))
        for (const imported of new Set(parsed.imports.values())) {
          if (isBuiltin(imported)) continue
          // Configuration imports resolve under Node conditions; client resolution can
          // accidentally optimize server-only packages into browser runtime.
          try {
            pending.push(createRequire(path).resolve(imported))
          }
          catch {
            const resolved = await source.server.pluginContainer?.resolveId(imported, path)
            if (resolved?.id) pending.push(resolved.id)
            else if (imported.startsWith('.')) throw new Error('Source import cannot be revalidated')
          }
        }
      }
    }
    result.assets = await assets(source, allowed)
    result.runtime = await runtime(source)
  }
  catch (error) {
    result.reason = error instanceof Error ? error.message : 'Source cannot be revalidated'
  }
  return result
}

/** Compare retained content against disk without executing or rendering a story. */
export async function validateVisualFingerprint(source: VisualSource, fingerprint: VisualFingerprint, live = false, validation?: VisualFingerprintValidation): Promise<string | undefined> {
  if (fingerprint.reason && !live) return fingerprint.reason
  try {
    const read = validation?.read ?? (<T>(_key: string, operation: () => Promise<T>) => operation())
    const allowed = await read('roots', () => roots(source))
    for (const [file, hash] of Object.entries(fingerprint.files)) {
      if (await read(`file:${file}`, () => content(file, allowed)) !== hash) return 'Source changed since capture'
    }
    if (fingerprint.runtime && stableVisualJson(await read('assets', () => assets(source, allowed)), 1024 * 1024) !== stableVisualJson(fingerprint.assets, 1024 * 1024)) return 'Source assets changed since capture'
    for (const [id, hash] of Object.entries(fingerprint.virtual)) {
      if (!id.startsWith('\0') && !id.startsWith('virtual:')) return 'Plugin-generated source cannot be revalidated'
      const loaded = await read(`virtual:${id}`, () => source.server.pluginContainer.load(id))
      const code = typeof loaded === 'string' ? loaded : loaded && loaded.code
      if (code === undefined || visualHash(code) !== hash) return 'Plugin-generated source changed since capture'
    }
    if (fingerprint.runtime && await read('runtime', () => runtime(source)) !== fingerprint.runtime) return 'Source environment changed since capture'
    validation?.validated.add(fingerprint)
  }
  catch { return 'Source dependencies cannot be revalidated' }
}

/** One retained fingerprint whose source inputs must still match at publication. */
export interface VisualFingerprintFenceEntry {
  /** Retained source authority. */
  fingerprint: VisualFingerprint
  /** Live captures ignore recorded unverifiable reason while their generation stays active. */
  live: boolean
}

/** Reread files once per synchronous pass; any unreadable or changed file fails its owners. */
function checkFenceFiles(files: { path: string, hash: string }[], reads: Map<string, string | undefined>): string | undefined {
  for (const file of files) {
    if (!reads.has(file.path)) {
      let hash: string | undefined
      try {
        const bytes = readVisualPublicationFile(file.path, 8 * 1024 * 1024)
        hash = bytes && visualHash(bytes)
      }
      catch {}
      reads.set(file.path, hash)
    }
    if (reads.get(file.path) !== file.hash) return 'Source changed since capture'
  }
}

/**
 * Final source fence for one approval group, prepared after baseline images and metadata are staged.
 * Returns opener for one synchronous publication pass. Each pass rereads every dependency once and
 * reports failures per fingerprint, so items with unrelated sources still publish.
 */
export async function createVisualFingerprintFence(source: VisualSource, entries: VisualFingerprintFenceEntry[], validation?: VisualFingerprintValidation): Promise<() => (fingerprint: VisualFingerprint) => void> {
  // Assets inventory, plugin loaders and runtime settings can change during staging: evaluate them
  // again with fresh memo, but only once for whole group instead of once per approved image.
  const fresh = createVisualFingerprintValidation()
  const allowed = await fresh.read('roots', () => roots(source))
  const canonical = new Map<string, Promise<string>>()
  const prepared = new Map<VisualFingerprint, { reason?: string, files: { path: string, hash: string }[] }>()
  for (const { fingerprint, live } of entries) {
    if (prepared.has(fingerprint)) continue
    // Shared file hashes were checked during preparation; synchronous pass below rereads them.
    const reason = await validateVisualFingerprint(source, validation?.validated.has(fingerprint) ? { ...fingerprint, files: {} } : fingerprint, live, fresh)
    if (reason) {
      prepared.set(fingerprint, { reason, files: [] })
      continue
    }
    try {
      const files = await Promise.all(Object.entries({ ...fingerprint.files, ...fingerprint.assets }).map(async ([path, hash]) => {
        if (!canonical.has(path)) canonical.set(path, realpath(path))
        const resolved = await canonical.get(path)!
        if (!allowed.some(root => resolved === root || resolved.startsWith(`${root}${sep}`))) throw new Error('Source dependency outside trusted workspace')
        return { path: resolved, hash }
      }))
      prepared.set(fingerprint, { files })
    }
    catch (error) {
      prepared.set(fingerprint, { reason: error instanceof Error ? error.message : 'Source dependencies cannot be revalidated', files: [] })
    }
  }
  return () => {
    const reads = new Map<string, string | undefined>()
    const outcomes = new Map<VisualFingerprint, string | undefined>()
    return (fingerprint) => {
      if (!source.isActive()) throw new Error('Source changed since capture')
      if (!outcomes.has(fingerprint)) {
        const entry = prepared.get(fingerprint)
        outcomes.set(fingerprint, entry ? entry.reason ?? checkFenceFiles(entry.files, reads) : 'Source dependencies cannot be revalidated')
      }
      const reason = outcomes.get(fingerprint)
      if (reason) throw new Error(reason)
    }
  }
}
