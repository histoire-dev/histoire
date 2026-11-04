import type { ViteDevServer } from 'vite'
import type { Context } from '../../context.js'
import type { CollectionModuleAnalysis } from './analysis.js'
import type { CollectionEvidence } from './evidence.js'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { HistoireSdkError } from '@histoire/protocol'
import { notifyStoryChange } from '../../stories.js'
import { debugVitestBrowser } from '../../util/browser-debug.js'
import { resolveHistoireAppEntry } from '../../util/resolve-histoire-app.js'
import { throwIfTestAborted, withTestAbort } from '../../util/test-abort.js'
import { GENERATED_GLOBAL_SETUP, NOOP_ID, RESOLVED_GENERATED_GLOBAL_SETUP, RESOLVED_GENERATED_SETUP_CODE, SETUP_ID } from '../../virtual/index.js'
import { histoireSharedPath } from '../../vite/resolve-paths.js'
import { STORY_VITEST_SHIM_ID } from '../../vite/story-vitest-shim.js'
import { createDependencyTracker, fingerprintLeaf, isIgnoredEvent, isInstalledModule } from './evidence.js'
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
  return service?.capture(storyId, signal) ?? { knownEmptyStoryIds: [], evidence: new Map<string, CollectionEvidence>(), assertCurrent() {} }
}

/** Cheap dependency-generation capture lets cache hits avoid every transform and graph proof; `verify` revalidates one story's evidence. */
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
const appClientRuntime = resolveHistoireAppEntry('api')

/** Inspect closed transformed graphs without executing user modules or mounting variants. */
export function createTestCollectionEligibility(ctx: Context, server: ViteDevServer) {
  let revision = 0
  let token = {}
  const modules = new Map<string, Promise<CollectionModuleAnalysis>>()
  const dependencies = new Set<string>()
  const tracker = createDependencyTracker()
  const container = server.environments?.client?.pluginContainer ?? server.pluginContainer
  /** Virtual leaves are fingerprinted by the bytes the client container loads. */
  async function load(id: string): Promise<string | undefined> {
    const loaded = await container.load(id)
    return typeof loaded === 'string' ? loaded : loaded ? loaded.code : undefined
  }
  /** Retired transforms cannot publish analyses after HMR or server closure; cancellation only drops its own failed inspections. */
  function retire() {
    revision++
    token = {}
    modules.clear()
    retireCollectionTransforms(ctx)
  }
  /** Watcher events touching proved graphs (or resolution) retire proofs, including files outside story roots. */
  function invalidate(event: string, file: string) {
    const dependency = dependencies.has(file)
    if (!dependency && isIgnoredEvent(ctx.root, file)) return
    // Served transforms may finish from retired bytes after any edit, so the
    // ordinary analysis memo stops being trusted even for unrelated modules.
    retireCollectionTransforms(ctx)
    // Edits outside every proved graph keep proofs, cached evidence and
    // in-flight collections: none of them read those bytes.
    if (!tracker.record(event, file, dependency)) return
    debugVitestBrowser('collection:invalidate', { event, file, revision })
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
  async function inspect(id: string, importer?: string, plumbing = false, signal?: AbortSignal): Promise<CollectionModuleAnalysis & { id: string, leaf?: string }> {
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
    if (isFrameworkRuntime(key) || key === generatedRuntime || key === appClientRuntime || /(?:\?|&)vue&type=style\b/.test(key) || /\.(?:css|scss|sass|less)(?:\?|$)/.test(key)) return { id: key, imports: [], safe: true }
    // Vite ignores installed dependency files, and plugin virtual modules change
    // without watcher events. They are never traversed nor proven empty; their
    // content fingerprint, checked on every reuse, makes them observable leaves.
    const ownedPlumbing = key === NOOP_ID || key === RESOLVED_GENERATED_GLOBAL_SETUP || key.startsWith(RESOLVED_GENERATED_SETUP_CODE) || key === '\0plugin-vue:export-helper'
    if (isInstalledModule(key) || (!key.startsWith('/') && !ownedPlumbing)) {
      // Fingerprinted on every proof, never memoized: virtual bytes change without events.
      const fingerprint = await fingerprintLeaf(key, load)
      throwIfTestAborted(signal)
      if (!fingerprint) debugVitestBrowser('collection:unobserved-module', key)
      return fingerprint ? { id: key, imports: [], safe: false, leaf: fingerprint } : { id: key, imports: [], safe: false, opaque: true }
    }
    if (!modules.has(key)) {
      const pending = (async () => {
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
        for (const file of analysis.watchFiles ?? []) dependencies.add(file)
        return analysis
      })()
      modules.set(key, pending)
      // Cancelled or failed inspections must not poison later proofs of this module.
      pending.catch(() => {
        if (modules.get(key) === pending) modules.delete(key)
      })
    }
    return { id: key, ...await modules.get(key)! }
  }

  /** Cycle-safe traversal checks every branch before accepting the root. */
  async function prove(roots: string[], signal?: AbortSignal, observe = false): Promise<{ empty: boolean, observed: boolean, files: Set<string>, leaves: Map<string, string> }> {
    const seen = new Set<string>()
    const files = new Set<string>()
    const leaves = new Map<string, string>()
    let empty = true
    let observed = true
    /** Registration-bearing nodes still expose their static dependencies for cache invalidation. */
    async function walk(id: string, importer?: string, plumbing = false): Promise<void> {
      throwIfTestAborted(signal)
      const node = await withTestAbort(() => inspect(id, importer, plumbing, signal), signal)
      empty &&= node.safe
      observed &&= !node.opaque
      // Watched files and leaf fingerprints become the story's reuse evidence.
      if (node.leaf) leaves.set(node.id, node.leaf)
      else if (node.id.startsWith('/')) files.add(node.id.split('?')[0])
      for (const file of node.watchFiles ?? []) files.add(file)
      if (seen.has(node.id) || (!node.safe && !observe) || node.opaque) return
      seen.add(node.id)
      await Promise.all(node.imports.map(edge => walk(edge, node.id, node.runtimeImports?.includes(edge))))
    }
    try {
      await Promise.all(roots.map(root => walk(root)))
      return { empty, observed, files, leaves }
    }
    catch (error) {
      debugVitestBrowser('collection:proof-unavailable', error instanceof Error ? error.message : error)
      throwIfTestAborted(signal)
      return { empty: false, observed: false, files, leaves }
    }
  }

  const service = {
    /** Setup and dependencies must be known empty for every story shortcut. */
    async analyze(storyId?: string | readonly string[], signal?: AbortSignal, observe = false) {
      const started = performance.now()
      const captured = revision
      // Captured before any byte is read: later edits of these graphs retire the evidence.
      const since = tracker.current()
      return withTestAbort(async () => {
        const setup = await prove([SETUP_ID, GENERATED_GLOBAL_SETUP], signal, observe)
        const stories = ctx.storyFiles.filter(file => file.story && !file.story.docsOnly && (!storyId || (typeof storyId === 'string' ? file.story.id === storyId : storyId.includes(file.story.id))))
        const proofs = setup.empty || (observe && setup.observed)
          ? await Promise.all(stories.map(async file => ({ id: file.story!.id, ...await prove([file.moduleId ?? file.path], signal, observe) })))
          : []
        throwIfTestAborted(signal)
        const current = captured === revision
        const knownEmptyStoryIds = current && setup.empty ? proofs.filter(proof => proof.empty).map(proof => proof.id) : []
        const evidence = new Map<string, CollectionEvidence>()
        for (const proof of current && setup.observed ? proofs.filter(proof => proof.observed) : []) {
          evidence.set(proof.id, { owner: service, since, files: new Set([...setup.files, ...proof.files]), leaves: new Map([...setup.leaves, ...proof.leaves]) })
        }
        debugVitestBrowser('collection:eligibility', { duration: performance.now() - started, stories: knownEmptyStoryIds.length, cacheable: evidence.size })
        return { knownEmptyStoryIds, evidence }
      }, signal)
    },
    /** Existing empty-story callers need no traversal beyond a registration-bearing node. */
    async collect(storyId?: string, signal?: AbortSignal): Promise<string[]> {
      return (await service.analyze(storyId, signal)).knownEmptyStoryIds
    },
    /** Opaque token captures service identity and every watcher event touching a proved graph. */
    generation() {
      const captured = token
      /** Leaf fingerprints shared by every story verified in this operation. */
      const fingerprints = new Map<string, Promise<string | undefined>>()
      /** Compares leaf fingerprints; memoized per operation so shared leaves are read once. */
      async function verifyLeaves(leaves: ReadonlyMap<string, string>): Promise<boolean> {
        const current = await Promise.all([...leaves.keys()].map((id) => {
          if (!fingerprints.has(id)) fingerprints.set(id, fingerprintLeaf(id, load))
          return fingerprints.get(id)!
        }))
        return [...leaves.values()].every((fingerprint, index) => current[index] === fingerprint)
      }
      return {
        token: captured,
        assertCurrent() {
          if (captured !== token || services.get(ctx) !== service) throw new HistoireSdkError('RUNTIME_CHANGED', 'Test collection dependency graph changed')
        },
        /** Evidence holds while its graph files saw no edit and every unwatched leaf keeps its content. */
        async verify(evidence: CollectionEvidence): Promise<boolean> {
          if (evidence.owner !== service || services.get(ctx) !== service || !tracker.unchanged(evidence.since, evidence.files)) return false
          return verifyLeaves(evidence.leaves)
        },
        /** Unwatched leaves alone: true while every one still has its recorded fingerprint (unverifiable counts as changed). */
        verifyLeaves,
      }
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
