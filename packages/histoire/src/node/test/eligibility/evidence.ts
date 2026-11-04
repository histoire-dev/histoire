import { createHash } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { analyzeCollectionModule } from './analysis.js'

/** Closed dependency graph one story's collected definitions were mounted from. */
export interface CollectionEvidence {
  /** Eligibility service that proved the graph; another server never vouches for it. */
  owner: object
  /** Watcher sequence captured before the proof read any module bytes. */
  since: number
  /** Watched files of the story and setup graphs, including plugin watch files. */
  files: ReadonlySet<string>
  /** Unwatched leaves (installed packages, plugin virtual modules) mapped to their content fingerprint. */
  leaves: ReadonlyMap<string, string>
}

/** Script, SFC and style modules: only these can be edited without touching any proved graph. */
const SOURCE_MODULE = /\.(?:vue|svelte|[cm]?[jt]sx?|css|scss|sass|less|styl|stylus|pcss|postcss)$/

/** Whether a path is a source module; shared with the affected-story classifier so both agree on what an independent edit is. */
export function isSourceModule(file: string): boolean {
  return SOURCE_MODULE.test(file)
}

/**
 * Orders watcher events so each story's evidence outlives edits outside its own graph.
 *
 * A dependency edit retires only graphs containing that file. Additions,
 * deletions and edits of non-module files (tsconfig, env, plugin data) can
 * change resolution or transforms anywhere, so they retire every graph.
 */
export function createDependencyTracker() {
  let sequence = 0
  let structure = 0
  const changes = new Map<string, number>()
  return {
    /** Sequence a proof captures before reading any module bytes. */
    current: () => sequence,
    /**
     * Records one watcher event.
     * @param event Chokidar event name.
     * @param file Absolute changed path.
     * @param dependency Whether some proved graph contains the file.
     * @returns `false` when the event cannot affect any proved graph.
     */
    record(event: string, file: string, dependency: boolean): boolean {
      // Content edits of modules outside every proof leave those graphs intact:
      // resolution only moves on add/unlink, which stay structural below.
      if (!dependency && event === 'change' && isSourceModule(file)) return false
      sequence++
      if (dependency && event === 'change') changes.set(file, sequence)
      else structure = sequence
      return true
    },
    /**
     * Whether no event recorded after `since` touches the given graph files.
     * @param since Sequence captured before the proof.
     * @param files Watched files of the proved graph.
     */
    unchanged(since: number, files: ReadonlySet<string>): boolean {
      if (structure > since) return false
      // Iterate changed files (few) rather than graph files (hundreds).
      for (const [file, changed] of changes) {
        if (changed > since && files.has(file)) return false
      }
      return true
    },
  }
}

/** A hidden directory segment (`.nuxt/`, `.histoire/`, `.output/`), never `..`. */
const HIDDEN_SEGMENT = /(?:^|\/)\.[^/.][^/]*\//

/**
 * Events outside every proved graph that cannot matter: installed packages and
 * hidden build/tool directories inside the project (Histoire's own cache, or
 * another Nuxt process regenerating `.nuxt/`). Graph members are never ignored.
 * @param root Project root.
 * @param file Absolute changed path.
 */
export function isIgnoredEvent(root: string, file: string): boolean {
  return isInstalledModule(file) || file.includes('/.histoire/') || (file.startsWith(`${root}/`) && HIDDEN_SEGMENT.test(file.slice(root.length + 1)))
}

/** Installed modules resolve inside `node_modules`, which Vite never watches. */
export function isInstalledModule(id: string): boolean {
  return id.includes('/node_modules/')
}

/**
 * Content fingerprint of a leaf Vite's watcher cannot observe, or `undefined` when unobservable.
 *
 * Installed files are compared by size and mtime, which every reinstall
 * changes. Virtual modules are compared by loaded bytes, and only import-free
 * ones qualify: their imports would be edges no watcher or fingerprint covers.
 * @param id Resolved module ID.
 * @param load Loads a virtual module's code through the client plugin container.
 */
export async function fingerprintLeaf(id: string, load: (id: string) => Promise<string | undefined>): Promise<string | undefined> {
  if (isInstalledModule(id)) {
    const info = await stat(id.split('?')[0]).catch(() => undefined)
    return info?.isFile() ? `file:${info.size}:${info.mtimeMs}` : undefined
  }
  const code = await load(id).catch(() => undefined)
  if (code === undefined) return
  const analysis = analyzeCollectionModule(code)
  if (analysis.opaque || analysis.imports.length) return
  return `virtual:${createHash('sha256').update(code).digest('hex')}`
}
