import type { HistoireConfig, PluginApiBase, PluginApiDev } from '@histoire/shared'
import type { TailwindTokensOptions } from './types.js'
import { createHash } from 'node:crypto'
import { basename, isAbsolute, join, relative, resolve } from 'pathe'
import { discoverTailwindSources, excludedTailwindDirectories, resolveTailwindEngine } from './discovery.js'
import { generateTailwindSnapshot } from './generate.js'
import { tailwindStoryTemplate } from './template.js'

/** Add group once while preserving user order and configuration. */
function ensureDesignSystemGroup(config: HistoireConfig) {
  config.tree ??= {}
  config.tree.groups ??= []
  if (!config.tree.groups.some(group => group.id === 'design-system')) {
    const top = config.tree.groups.findIndex(group => group.id === 'top')
    config.tree.groups.splice(top + 1, 0, { id: 'design-system', title: 'Design System' })
  }
}

/** Owns generation, dependencies and publication for exactly one captured runtime. */
export function createTailwindSession(api: PluginApiBase, options: TailwindTokensOptions, dev: boolean) {
  const published = new Map<string, { file: string, signature: string }>()
  const dependencies = new Set<string>()
  const sourceDependencies = new Map<string, Set<string>>()
  let revision = 0
  let stopped = false
  let pending: Promise<void> | undefined
  let watcher: ReturnType<PluginApiDev['watcher']['watch']> | undefined
  let finishWatch: (() => void) | undefined
  /** Reads both local closure and captured runtime admission fence. */
  const isActive = () => !stopped && api.isActive()

  /** Stage each source independently; a failing source retains its last valid files. */
  async function generate(capturedRevision: number) {
    const current = () => isActive() && capturedRevision === revision
    const engine = await resolveTailwindEngine(api.root)
    if (!engine) {
      if (options.configFile || options.cssFile) throw new Error(`Cannot resolve Tailwind CSS from ${api.root}`)
      return
    }
    const sources = await discoverTailwindSources(api, engine, options)
    const retained = new Set(sources.map(source => source.id))
    api.moduleLoader.clearCache()
    const errors: Error[] = []
    for (const source of sources) {
      if (!current()) return
      const acquired = new Set([source.path])
      try {
        const result = await generateTailwindSnapshot(api, engine, source, options, acquired)
        for (const file of result.dependencies) acquired.add(file)
        if (!current()) return
        sourceDependencies.set(source.id, acquired)
        const directory = join(api.pluginTempDir, source.id)
        const cssHash = createHash('sha256').update(result.css).digest('hex').slice(0, 12)
        const stylesheet = `tokens-${cssHash}.css`
        const story = tailwindStoryTemplate(api, result.snapshot, stylesheet)
        const signature = createHash('sha256').update(story).update(result.css).digest('hex')
        if (published.get(source.id)?.signature === signature) continue
        await api.fs.ensureDir(directory)
        if (!current()) return
        // Content-addressed CSS stays immutable. Only final story rename is
        // publication, so readers never import a partially replaced stylesheet.
        await api.fs.writeFile(join(directory, stylesheet), result.css)
        const stage = join(directory, '.story.pending')
        const file = join(directory, 'Tailwind.story.js')
        await api.fs.writeFile(stage, story)
        if (!current()) {
          await api.fs.remove(stage)
          return
        }
        await api.fs.rename(stage, file)
        if (!current()) return
        ensureDesignSystemGroup(api.getConfig())
        api.addStoryFile(file)
        published.set(source.id, { file, signature })
      }
      catch (error) {
        for (const file of api.moduleLoader.getDependencies?.(source.path) ?? []) acquired.add(file)
        // Failed attempts keep dependencies of last valid output as well as
        // missing candidates, so either repairing or reverting can recover.
        sourceDependencies.set(source.id, new Set([...sourceDependencies.get(source.id) ?? [], ...acquired]))
        const failure = new Error(`Tailwind ${source.relativePath}: ${error instanceof Error ? error.message : String(error)}`)
        errors.push(failure)
        if (dev && current()) api.error(failure.message)
      }
    }
    if (!current()) return
    for (const id of sourceDependencies.keys()) {
      if (!retained.has(id)) sourceDependencies.delete(id)
    }
    for (const [id, output] of published) {
      if (!retained.has(id)) {
        api.removeStoryFile(output.file)
        published.delete(id)
        await api.fs.remove(api.path.dirname(output.file))
      }
    }
    const next = new Set([...sourceDependencies.values()].flatMap(files => [...files]))
    const removed = [...dependencies].filter(file => !next.has(file))
    dependencies.clear()
    for (const file of next) dependencies.add(file)
    if (watcher) {
      await watcher.unwatch(removed)
      watcher.add([...dependencies].filter(file => isAbsolute(file) && !file.includes('\0')))
    }
    if (errors.length && !dev) throw new AggregateError(errors, errors.map(error => error.message).join('\n'))
  }

  /** Coalesce refresh bursts into one latest rerun, with no concurrent writer. */
  function refresh(): Promise<void> {
    if (!isActive()) return Promise.resolve()
    revision++
    return pending ??= (async () => {
      let captured: number
      do {
        captured = revision
        try {
          await generate(captured)
        }
        catch (error) {
          if (!dev) throw error
          if (isActive()) api.error(error instanceof Error ? error.message : String(error))
        }
      } while (isActive() && captured !== revision)
    })().finally(() => { pending = undefined })
  }

  return {
    refresh,
    /** Watch candidate directories and acquired dependencies without watching own outputs. */
    async watch(devApi: PluginApiDev) {
      if (!isActive()) return
      const output = api.getConfig().outDir
      watcher = devApi.watcher.watch(api.root, {
        ignoreInitial: true,
        ignored: (file) => {
          if (dependencies.has(file)) return false
          const parts = relative(api.root, file).split('/')
          return parts.some(part => excludedTailwindDirectories.has(part))
            || (!!output && file.startsWith(`${resolve(api.root, output)}/`))
        },
      })
      watcher.on('all', (_event, file) => {
        if (!isActive()) return
        if (dependencies.has(file) || /\.(?:css|pcss|postcss)$/.test(file) || /^tailwind[.-]config\.[cm]?[jt]s$/.test(basename(file))) void refresh()
      })
      await new Promise<void>((resolveReady, reject) => {
        /** Release startup on readiness or cancellation without leaving listeners. */
        const ready = () => {
          cleanup()
          resolveReady()
        }
        /** Fail startup when filesystem discovery fails. */
        const failed = (error: unknown) => {
          cleanup()
          reject(error)
        }
        /** Remove both terminal listeners after either event settles startup. */
        function cleanup() {
          watcher!.off('ready', ready)
          watcher!.off('error', failed)
          finishWatch = undefined
        }
        // Chokidar can close before its initial scan emits ready. Teardown must
        // release the startup waiter itself so canceled projects cannot hang.
        finishWatch = ready
        watcher!.once('ready', ready)
        watcher!.once('error', failed)
      })
    },
    /** Stop publication before joining writer and watcher teardown. */
    async close() {
      stopped = true
      finishWatch?.()
      await watcher?.close()
      await pending
    },
  }
}
