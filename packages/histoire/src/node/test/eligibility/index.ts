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
import { throwIfTestAborted, withTestAbort } from '../../util/test-abort.js'
import { GENERATED_GLOBAL_SETUP, NOOP_ID, RESOLVED_GENERATED_GLOBAL_SETUP, RESOLVED_GENERATED_SETUP_CODE, SETUP_ID } from '../../virtual/index.js'
import { histoireSharedPath } from '../../vite/resolve-paths.js'
import { STORY_VITEST_SHIM_ID } from '../../vite/story-vitest-shim.js'
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
export async function captureTestCollectionEligibility(ctx: Context, storyId?: string | readonly string[], signal?: AbortSignal) {
  const service = services.get(ctx)
  return service?.capture(storyId, signal) ?? { knownEmptyStoryIds: [], cacheableStoryIds: [], assertCurrent() {} }
}

/** Cheap dependency-generation capture lets cache hits avoid every transform and graph proof. */
export function captureTestCollectionGeneration(ctx: Context) {
  return services.get(ctx)?.generation()
}

/** Installed framework runtimes cannot register Histoire tests; user code remains fully traversed. */
function isFrameworkRuntime(id: string): boolean {
  return /\/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?(?:(?:vue|pinia|vue-demi)\/|@vue\/)/.test(id)
    || /\/node_modules\/\.vite\/deps\/(?:vue|pinia|vue-demi|@vue_[\w-]+)\.js(?:\?|$)/.test(id)
    || /\/histoire-vendors\/dist\/(?:client\/)?(?:vue(?:\.runtime\.esm-bundler)?|pinia)(?:\.js|\/)/.test(id)
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
  let token = {}
  const modules = new Map<string, Promise<CollectionModuleAnalysis>>()
  const dependencies = new Set<string>()
  const container = server.environments?.client?.pluginContainer ?? server.pluginContainer
  /** Retired transforms cannot publish analyses after abort, HMR, or server closure. */
  function retire() {
    revision++
    token = {}
    modules.clear()
    retireCollectionTransforms(ctx)
  }
  /** Any watcher event retires shared setup and transitive proofs, including files outside story roots. */
  function invalidate(_event: string, file: string) {
    const dependency = dependencies.has(file)
    if (!dependency && (file.includes('/.histoire/') || file.includes('/node_modules/'))) return
    debugVitestBrowser('collection:invalidate', { event: _event, file, revision })
    retire()
    // Dependency/setup edits must invalidate definition evidence even when
    // story bytes (and therefore runtimeRevision) have not changed.
    if (dependency && !ctx.storyFiles.some(story => story.path === file)) notifyStoryChange(ctx)
  }
  server.watcher.on('all', invalidate)
  server.httpServer?.once('close', () => {
    retire()
    server.watcher.off('all', invalidate)
  })

  /** Resolve before trusting runtime identities; unknown and external edges remain mounted. */
  async function inspect(id: string, importer?: string, plumbing = false, signal?: AbortSignal): Promise<CollectionModuleAnalysis & { id: string }> {
    // Scan resolution preserves original package identities and aliases, without
    // replacing dependencies by opaque optimizer bundles shared with Vue itself.
    const resolutionOptions = { isEntry: false, scan: true }
    const resolved = await container.resolveId(id, importer, resolutionOptions)
    throwIfTestAborted(signal)
    if (!resolved || resolved.external) {
      debugVitestBrowser('collection:unresolved-module', { id, importer })
      return { id, imports: [], safe: false, opaque: true }
    }
    const key = resolved.id
    dependencies.add(key.split('?')[0])
    // Files outside the project root must participate in the same existing
    // watcher, otherwise successful definitions could survive dependency edits.
    if (key.startsWith('/') && !key.includes('/node_modules/')) server.watcher.add(key.split('?')[0])
    if (key === STORY_VITEST_SHIM_ID) return { id: key, imports: [], safe: false }
    if (plumbing && key === clientRuntime) {
      const [app, shared] = await Promise.all(['@histoire/app', '@histoire/shared'].map(edge => container.resolveId(edge, key, resolutionOptions)))
      throwIfTestAborted(signal)
      if (app?.id === appClientRuntime && shared?.id === histoireSharedPath) {
        dependencies.add(app.id)
        dependencies.add(shared.id)
        return { id: key, imports: [], safe: true }
      }
    }
    if (isFrameworkRuntime(key) || key === generatedRuntime || key === generatedEmptyState || /(?:\?|&)vue&type=style\b/.test(key) || /\.(?:css|scss|sass|less)(?:\?|$)/.test(key)) return { id: key, imports: [], safe: true }
    // Vite ignores installed dependency files. A parsed graph whose edits are
    // unobservable cannot supply reusable evidence or a retained empty proof.
    const ownedPlumbing = key === NOOP_ID || key === RESOLVED_GENERATED_GLOBAL_SETUP || key.startsWith(RESOLVED_GENERATED_SETUP_CODE) || key === '\0plugin-vue:export-helper'
    if (key.includes('/node_modules/') || (!key.startsWith('/') && !ownedPlumbing)) {
      debugVitestBrowser('collection:unobserved-module', key)
      return { id: key, imports: [], safe: false, opaque: true }
    }
    if (!modules.has(key)) {
      modules.set(key, (async () => {
      // Using pre-import-analysis transforms avoids Vite's injected HMR imports and
      // preserves package identities instead of optimizer-generated chunk URLs.
        await server.environments.client.moduleGraph.ensureEntryFromUrl(key)
        throwIfTestAborted(signal)
        const analysis = await transformCollectionEligibility(ctx, key, async () => {
          const loaded = await container.load(key) ?? await readFile(key.split('?')[0], 'utf8')
          throwIfTestAborted(signal)
          if (loaded) await container.transform(typeof loaded === 'string' ? loaded : loaded.code, key)
        }, signal) ?? { imports: [], safe: false, opaque: true as const }
        throwIfTestAborted(signal)
        if (!analysis.safe) debugVitestBrowser('collection:registration-module', { id: key, opaque: !!analysis.opaque, plumbing: analysis.runtimeImports })
        return analysis
      })())
    }
    return { id: key, ...await modules.get(key)! }
  }

  /** Cycle-safe traversal checks every branch before accepting the root. */
  async function prove(roots: string[], signal?: AbortSignal, observe = false): Promise<{ empty: boolean, observed: boolean }> {
    const seen = new Set<string>()
    let empty = true
    let observed = true
    /** Registration-bearing nodes still expose their static dependencies for cache invalidation. */
    async function walk(id: string, importer?: string, plumbing = false): Promise<void> {
      throwIfTestAborted(signal)
      const node = await withTestAbort(() => inspect(id, importer, plumbing, signal), signal)
      empty &&= node.safe
      observed &&= !node.opaque
      if (seen.has(node.id) || (!node.safe && !observe) || node.opaque) return
      seen.add(node.id)
      await Promise.all(node.imports.map(edge => walk(edge, node.id, node.runtimeImports?.includes(edge))))
    }
    try {
      await Promise.all(roots.map(root => walk(root)))
      return { empty, observed }
    }
    catch (error) {
      debugVitestBrowser('collection:proof-unavailable', error instanceof Error ? error.message : error)
      throwIfTestAborted(signal)
      return { empty: false, observed: false }
    }
  }

  const service = {
    /** Setup and dependencies must be known empty for every story shortcut. */
    async analyze(storyId?: string | readonly string[], signal?: AbortSignal, observe = false) {
      const started = performance.now()
      const captured = revision
      signal?.addEventListener('abort', retire, { once: true })
      try {
        return await withTestAbort(async () => {
          const setup = await prove([SETUP_ID, GENERATED_GLOBAL_SETUP], signal, observe)
          const stories = ctx.storyFiles.filter(file => file.story && !file.story.docsOnly && (!storyId || (typeof storyId === 'string' ? file.story.id === storyId : storyId.includes(file.story.id))))
          const proofs = setup.empty || (observe && setup.observed)
            ? await Promise.all(stories.map(async file => ({ id: file.story!.id, ...await prove([file.moduleId ?? file.path], signal, observe) })))
            : []
          throwIfTestAborted(signal)
          const current = captured === revision
          const knownEmptyStoryIds = current && setup.empty ? proofs.filter(proof => proof.empty).map(proof => proof.id) : []
          const cacheableStoryIds = current && setup.observed ? proofs.filter(proof => proof.observed).map(proof => proof.id) : []
          debugVitestBrowser('collection:eligibility', { duration: performance.now() - started, stories: knownEmptyStoryIds.length, cacheable: cacheableStoryIds.length })
          return { knownEmptyStoryIds, cacheableStoryIds }
        }, signal)
      }
      finally { signal?.removeEventListener('abort', retire) }
    },
    /** Existing empty-story callers need no traversal beyond a registration-bearing node. */
    async collect(storyId?: string, signal?: AbortSignal): Promise<string[]> {
      return (await service.analyze(storyId, signal)).knownEmptyStoryIds
    },
    /** Opaque token captures service identity and every dependency watcher event. */
    generation() {
      const captured = token
      return { token: captured, assertCurrent() {
        if (captured !== token || services.get(ctx) !== service) throw new HistoireSdkError('RUNTIME_CHANGED', 'Test collection dependency graph changed')
      } }
    },
    /** Late dependency edits revoke both queued proof and partial publication authority. */
    async capture(storyId?: string | readonly string[], signal?: AbortSignal) {
      const generation = service.generation()
      const result = await service.analyze(storyId, signal, true)
      generation.assertCurrent()
      return { ...result, ...generation }
    },
  }
  return service
}
