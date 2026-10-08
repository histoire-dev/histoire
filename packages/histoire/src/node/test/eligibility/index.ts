import type { ViteDevServer } from 'vite'
import type { Context } from '../../context.js'
import type { CollectionModuleAnalysis } from './analysis.js'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { HistoireSdkError } from '@histoire/protocol'
import { resolve } from 'pathe'
import { notifyStoryChange } from '../../stories.js'
import { debugVitestBrowser } from '../../util/browser-debug.js'
import { resolveHistoireAppBundledDir } from '../../util/resolve-histoire-app.js'
import { GENERATED_GLOBAL_SETUP, SETUP_ID } from '../../virtual/index.js'
import { histoireSharedPath } from '../../vite/resolve-paths.js'
import { retireCollectionTransforms, transformCollectionEligibility } from './transforms.js'

/** Exact context owns the client transform graph; snapshots never acquire a new server. */
const services = new WeakMap<Context, ReturnType<typeof createTestCollectionEligibility>>()

/** Attach generation-local proof collection before dev-event admission. */
export function attachTestCollectionEligibility(ctx: Context, server: ViteDevServer): void {
  const service = createTestCollectionEligibility(ctx, server)
  services.set(ctx, service)
  server.httpServer?.once('close', () => {
    services.delete(ctx)
    retireCollectionTransforms(ctx)
  })
}

/** Absent client graph never establishes a test-free story. */
export async function getKnownEmptyTestStories(ctx: Context, storyId?: string, signal?: AbortSignal): Promise<string[]> {
  return services.get(ctx)?.collect(storyId, signal) ?? []
}

/** Capture graph ownership as well as the private empty-story inventory. */
export async function captureTestCollectionEligibility(ctx: Context, storyId?: string, signal?: AbortSignal) {
  const service = services.get(ctx)
  return service?.capture(storyId, signal) ?? { knownEmptyStoryIds: [], assertCurrent() {} }
}

/** Installed framework runtimes cannot register Histoire tests; user code remains fully traversed. */
function isFrameworkRuntime(id: string): boolean {
  return /\/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?(?:vue\/|@vue\/)/.test(id)
    || /\/node_modules\/\.vite\/deps\/(?:vue|@vue_[\w-]+)\.js(?:\?|$)/.test(id)
    || /\/histoire-vendors\/dist\/(?:client\/)?vue(?:\.runtime\.esm-bundler)?(?:\.js|\/)/.test(id)
}

/** Existing trusted generated-story renderer has no setupApp or registrations. */
const generatedRuntime = fileURLToPath(new URL('../../builtin-plugins/tailwind/runtime/story.js', import.meta.url))
/** Public helper exports are trusted only through this owned module, never user aliases. */
const clientRuntime = fileURLToPath(new URL('../../../../client.js', import.meta.url))
/** User aliases cannot substitute registration code behind trusted client plumbing. */
const appClientRuntime = fileURLToPath(import.meta.resolve('@histoire/app'))
/** Generated story's injected empty-state renderer is Histoire plumbing, not user registration code. */
const generatedEmptyState = resolve(resolveHistoireAppBundledDir(), 'components/shell/WorkbenchEmptyState.vue.js')

/** Inspect closed transformed graphs without executing user modules or mounting variants. */
export function createTestCollectionEligibility(ctx: Context, server: ViteDevServer) {
  let revision = 0
  const modules = new Map<string, Promise<CollectionModuleAnalysis>>()
  const dependencies = new Set<string>()
  const container = server.environments?.client?.pluginContainer ?? server.pluginContainer
  /** Any watcher event retires shared setup and transitive proofs, including files outside story roots. */
  function invalidate(_event: string, file: string) {
    const dependency = dependencies.has(file)
    if (!dependency && (file.includes('/.histoire/') || file.includes('/node_modules/'))) return
    revision++
    modules.clear()
    retireCollectionTransforms(ctx)
    // Dependency/setup edits must invalidate definition evidence even when
    // story bytes (and therefore runtimeRevision) have not changed.
    if (dependency && !ctx.storyFiles.some(story => story.path === file)) notifyStoryChange(ctx)
  }
  server.watcher.on('all', invalidate)
  server.httpServer?.once('close', () => server.watcher.off('all', invalidate))

  /** Resolve before trusting runtime identities; unknown and external edges remain mounted. */
  async function inspect(id: string, importer?: string, plumbing = false): Promise<CollectionModuleAnalysis & { id: string }> {
    // Scan resolution preserves original package identities and aliases, without
    // replacing dependencies by opaque optimizer bundles shared with Vue itself.
    const resolutionOptions = { isEntry: false, scan: true }
    const resolved = await container.resolveId(id, importer, resolutionOptions)
    if (!resolved || resolved.external) {
      debugVitestBrowser('collection:unresolved-module', { id, importer })
      return { id, imports: [], safe: false }
    }
    const key = resolved.id
    dependencies.add(key.split('?')[0])
    if (plumbing && key === clientRuntime) {
      const [app, shared] = await Promise.all(['@histoire/app', '@histoire/shared'].map(edge => container.resolveId(edge, key, resolutionOptions)))
      if (app?.id === appClientRuntime && shared?.id === histoireSharedPath) {
        dependencies.add(app.id)
        dependencies.add(shared.id)
        return { id: key, imports: [], safe: true }
      }
    }
    if (isFrameworkRuntime(key) || key === generatedRuntime || key === generatedEmptyState || /(?:\?|&)vue&type=style\b/.test(key) || /\.(?:css|scss|sass|less)(?:\?|$)/.test(key)) return { id: key, imports: [], safe: true }
    if (!modules.has(key)) {
      modules.set(key, (async () => {
      // Using pre-import-analysis transforms avoids Vite's injected HMR imports and
      // preserves package identities instead of optimizer-generated chunk URLs.
        await server.environments.client.moduleGraph.ensureEntryFromUrl(key)
        const analysis = await transformCollectionEligibility(ctx, key, async () => {
          const loaded = await container.load(key) ?? await readFile(key.split('?')[0], 'utf8')
          if (loaded) await container.transform(typeof loaded === 'string' ? loaded : loaded.code, key)
        }) ?? { imports: [], safe: false }
        if (!analysis.safe) debugVitestBrowser('collection:opaque-module', key)
        return analysis
      })())
    }
    return { id: key, ...await modules.get(key)! }
  }

  /** Cycle-safe traversal checks every branch before accepting the root. */
  async function prove(roots: string[], signal?: AbortSignal): Promise<boolean> {
    const seen = new Set<string>()
    async function walk(id: string, importer?: string, plumbing = false): Promise<boolean> {
      signal?.throwIfAborted()
      const node = await inspect(id, importer, plumbing)
      if (!node.safe) return false
      if (seen.has(node.id)) return true
      seen.add(node.id)
      return (await Promise.all(node.imports.map(edge => walk(edge, node.id, node.runtimeImports?.includes(edge))))).every(Boolean)
    }
    try {
      return (await Promise.all(roots.map(root => walk(root)))).every(Boolean)
    }
    catch (error) {
      debugVitestBrowser('collection:proof-unavailable', error instanceof Error ? error.message : error)
      signal?.throwIfAborted()
      return false
    }
  }

  const service = {
    /** Setup and dependencies must be known empty for every story shortcut. */
    async collect(storyId?: string, signal?: AbortSignal): Promise<string[]> {
      const started = performance.now()
      const captured = revision
      if (!await prove([SETUP_ID, GENERATED_GLOBAL_SETUP], signal)) return []
      const stories = ctx.storyFiles.filter(file => file.story && !file.story.docsOnly && (!storyId || file.story.id === storyId))
      const proofs = await Promise.all(stories.map(async file => await prove([file.moduleId ?? file.path], signal) ? file.story!.id : undefined))
      const result = captured === revision ? proofs.filter((id): id is string => id !== undefined) : []
      debugVitestBrowser('collection:eligibility', { duration: performance.now() - started, stories: result.length })
      return result
    },
    /** Late dependency edits revoke both queued proof and partial publication authority. */
    async capture(storyId?: string, signal?: AbortSignal) {
      const captured = revision
      const knownEmptyStoryIds = await service.collect(storyId, signal)
      return { knownEmptyStoryIds, assertCurrent() {
        if (captured !== revision || services.get(ctx) !== service) throw new HistoireSdkError('RUNTIME_CHANGED', 'Test collection dependency graph changed')
      } }
    },
  }
  return service
}
