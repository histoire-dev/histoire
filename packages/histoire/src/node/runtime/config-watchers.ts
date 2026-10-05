import type { Buffer } from 'node:buffer'
import type { ProjectConfigurationRevision, ProjectRuntimeDependencies } from './types.js'
import { readFile } from 'node:fs/promises'
import chokidar from 'chokidar'
import path from 'pathe'
import { configFileNames, resolveConfigFile } from '../config/index.js'
import { createCleanupStack } from './cleanup.js'

/** Missing files are a distinct snapshot so creation and removal stay observable. */
async function configSnapshot(file: string): Promise<Buffer | undefined> {
  try {
    return await readFile(file)
  }
  catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return
    throw error
  }
}

/** Vite default discovery candidates, captured before Vite reads its selected file. */
const viteConfigFileNames = [
  'vite.config.js',
  'vite.config.mjs',
  'vite.config.ts',
  'vite.config.cjs',
  'vite.config.mts',
  'vite.config.cts',
]

/** Resolves ordered default config candidates below one project root. */
function localConfigFiles(root: string, names: readonly string[]): string[] {
  return names.map(name => path.join(root, name))
}

/** Covers each directory that can supersede an inherited config selection. */
function histoireConfigFiles(root: string, config: string | undefined, acquired: string | null): string[] {
  if (config) return []
  const acquiredDirectory = acquired ? path.dirname(acquired) : null
  const directories = [root]
  let directory = root
  if (acquiredDirectory) {
    for (;;) {
      if (directory === acquiredDirectory) break
      const parent = path.dirname(directory)
      if (parent === directory) break
      directories.push(parent)
      directory = parent
    }
  }
  return directories.flatMap((directory) => {
    const index = directory === acquiredDirectory && acquired ? configFileNames.indexOf(path.basename(acquired)) : -1
    return localConfigFiles(directory, index < 0 ? configFileNames : configFileNames.slice(0, index + 1))
  })
}

/** Includes Histoire and Vite acquisition inputs, including files created mid-acquisition. */
function configurationFiles(root: string, config: string | undefined, histoireFile: string | null): string[] {
  const histoireFiles = histoireConfigFiles(root, config, histoireFile)
  const files = new Set([...histoireFiles, ...localConfigFiles(root, viteConfigFileNames)])
  if (histoireFile) files.add(path.resolve(histoireFile))
  return [...files]
}

/** Retains selected inputs plus paths that can overtake them by config priority. */
function watchedConfigFiles(candidates: readonly string[], current: string | null, acquired: string | null): string[] {
  const selected = current ?? acquired
  const index = selected ? candidates.indexOf(selected) : -1
  const files = new Set(index < 0 ? candidates : candidates.slice(0, index + 1))
  if (current) files.add(current)
  if (acquired) files.add(acquired)
  return [...files]
}

/** Captures config bytes immediately before one generation begins acquisition. */
export async function captureProjectConfigurationRevision(root: string, config?: string): Promise<ProjectConfigurationRevision> {
  root = path.resolve(root)
  const histoireFile = resolveConfigFile(root, config)
  const viteFiles = localConfigFiles(root, viteConfigFileNames)
  const files = configurationFiles(root, config, histoireFile)
  const snapshots = new Map(await Promise.all(files.map(async file => [file, await configSnapshot(file)] as const)))
  return {
    histoireFile: histoireFile ? path.resolve(histoireFile) : null,
    viteConfigFile: viteFiles.find(file => snapshots.get(file) !== undefined) ?? null,
    snapshots,
  }
}

/** Owns all configuration watchers for one runtime generation. */
export const watchProjectConfiguration: ProjectRuntimeDependencies['watch'] = async (runtime, options, restart, revision) => {
  const cleanup = createCleanupStack()
  let stopped = false
  let changes = Promise.resolve()
  try {
    const root = path.resolve(runtime.context.root)
    const histoireFile = resolveConfigFile(root, options.config)
    const viteFile = runtime.viteConfigFile ? path.resolve(runtime.viteConfigFile) : null
    const files = new Map<string, string>()
    for (const file of watchedConfigFiles(localConfigFiles(root, viteConfigFileNames), viteFile, revision?.viteConfigFile ?? null)) files.set(file, 'Vite')
    const histoireCandidates = histoireConfigFiles(root, options.config, revision?.histoireFile ?? histoireFile)
    for (const file of watchedConfigFiles(histoireCandidates, histoireFile, revision?.histoireFile ?? null)) files.set(file, 'Histoire')
    const snapshots = new Map(await Promise.all([...files.keys()].map(async file => [
      file,
      revision?.snapshots.has(file) ? revision.snapshots.get(file) : await configSnapshot(file),
    ] as const)))
    // Directory watches retain creation, priority replacement and unlink events
    // that a named missing-file watcher can lose before its parent subscribes.
    const targets = [...new Set([root, ...[...files.keys()].map(file => path.dirname(file))])]
    const watcher = chokidar.watch(targets, { ignoreInitial: true, depth: 0 })
    cleanup.add(async () => {
      await watcher.close()
      await changes
    })
    /** Every relevant config transition belongs to this captured generation. */
    const changed = (file: string) => {
      file = path.resolve(file)
      const source = files.get(file)
      if (stopped || !source) return
      // Hardlink publication can emit add/change for identical bytes. Serial reads
      // coalesce those notifications without dropping a subsequent distinct edit.
      changes = changes.then(async () => {
        if (stopped) return
        const next = await configSnapshot(file)
        const previous = snapshots.get(file)
        if (stopped || (next === undefined ? previous === undefined : previous?.equals(next))) return
        snapshots.set(file, next)
        restart(source)
      }).catch((error) => {
        if (!stopped) options.onError?.(error)
      })
    }
    watcher.on('change', changed)
    watcher.on('add', changed)
    watcher.on('unlink', changed)
    watcher.on('error', error => !stopped && options.onError?.(error))
    await new Promise<void>((resolve, reject) => {
      watcher.once('ready', resolve)
      watcher.once('error', reject)
    })
    // ignoreInitial swallows edits that land while chokidar scans. Compare the
    // acquisition revision only after ready, through same serialized lane as
    // live events, so this generation cannot publish stale configuration.
    for (const file of files.keys()) changed(file)
    await changes
    return () => {
      stopped = true
      return cleanup.close()
    }
  }
  catch (error) {
    stopped = true
    await cleanup.close()
    throw error
  }
}
