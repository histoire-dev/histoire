import type { HistoireProjectTestCollectionResult, HistoireTestCollectionResult } from '@histoire/protocol'
import type { Context } from '../context.js'
import type { CollectHistoireTestsOptions } from './types.js'
import { basename } from 'node:path'
import { getHistoireTargetKey, HistoireSdkError, validateProjectTestCollection } from '@histoire/protocol'
import { serializeTestErrors } from '@histoire/shared'
import fs from 'fs-extra'
import { normalize } from 'pathe'
import { validId } from '../runtime/catalog/lookup.js'
import { debugVitestBrowser } from '../util/browser-debug.js'
import { getRunTempDir } from '../util/temp-paths.js'
import { throwIfTestAborted } from '../util/test-abort.js'
import { getCollectTimeout } from '../util/test-timeouts.js'
import { assertVitestRunHasNoUnhandledErrors } from '../util/vitest-errors.js'
import { runVitestAttempts } from '../util/vitest-run.js'
import { createTestCollectionChannel } from './collection-channel.js'
import { ensureBrowserTestDepsInstalled, ensureProjectVitest } from './preflight.js'
import { generateSpecFiles } from './spec-files.js'
import { getTestVitestConfig } from './vitest-config.js'

/** Collect mounted variant definitions from captured dev metadata, without executing tests. */
export async function collectHistoireProjectTests(ctx: Context, options: CollectHistoireTestsOptions = {}): Promise<HistoireProjectTestCollectionResult> {
  const started = performance.now()
  throwIfTestAborted(options.signal)
  if (options.storyId !== undefined && !validId(options.storyId)) throw new HistoireSdkError('INVALID_ARGUMENT', 'Test target IDs must be non-empty strings')
  const stories = ctx.storyFiles.filter(file => file.story && !file.story.docsOnly && (options.storyId === undefined || file.story.id === options.storyId))
  if (options.storyId !== undefined && !stories.length) throw new HistoireSdkError('STORY_NOT_FOUND', 'Requested story could not be resolved')
  if (options.storyId !== undefined && stories.length > 1) throw new HistoireSdkError('STORY_AMBIGUOUS', 'Requested story ID is ambiguous')
  const root = getRunTempDir(ctx.root, 'test-collection')
  const execution = { runId: options.collectionRunId ?? basename(root), mode: 'server' as const }
  const empty = new Set(options.knownEmptyStoryIds)
  const remaining = stories.filter(file => !empty.has(file.story!.id))
  const targets = stories.flatMap(file => file.story!.variants.map(variant => ({ storyId: file.story!.id, variantId: variant.id })))
  const completed = new Map<string, HistoireProjectTestCollectionResult['variants'][number]>()
  for (const target of targets) {
    if (empty.has(target.storyId)) completed.set(getHistoireTargetKey(target), { target, collection: { definitions: [] } })
  }
  if (completed.size) options.onProgress?.({ execution, variants: [...completed.values()] })
  try {
    if (!stories.some(file => file.story!.variants.length)) return { execution, variants: [] }
    if (!remaining.some(file => file.story!.variants.length)) return { execution, variants: [...completed.values()] }
    if (options.isolate) {
      const { collectIsolatedHistoireTests } = await import('./isolated.js')
      return await collectIsolatedHistoireTests(ctx, { ...options, collectionRunId: execution.runId })
    }
    ensureProjectVitest(ctx)
    await ensureBrowserTestDepsInstalled(ctx.root)
    throwIfTestAborted(options.signal)
    const generationStarted = performance.now()
    const specs = await generateSpecFiles(remaining, root, 'collect', execution.runId)
    debugVitestBrowser('collection:specs', { duration: performance.now() - generationStarted, variants: specs.length })
    const include = specs.map(spec => spec.path)
    const channel = createTestCollectionChannel(execution, specs.map(spec => ({ storyId: spec.storyId, variantId: spec.variantId })), options.onProgress)
    const result = await runVitestAttempts<undefined, HistoireProjectTestCollectionResult>({
      root: ctx.root,
      mode: 'collect',
      signal: options.signal,
      strictCleanup: options.strictCleanup,
      maxRetries: options.maxRetries,
      label: 'Histoire test collection',
      retryMessage: 'Retrying Histoire test collection after Vitest browser optimizer reload',
      async setup() {
        // Harness loaders are optimizer entry edges: proven-empty stories must
        // not pull their entire dependency graph back into mounted discovery.
        const config = await getTestVitestConfig({ ...ctx, storyFiles: remaining }, include, 'definitions', [channel.plugin])
        return {
          vitestOptions: { ...config.vitestOptions, config: false, run: true, watch: false, passWithNoTests: true, include },
          viteConfig: config.viteConfig,
          browserProjectOptions: config.vitestOptions,
          timeoutMs: getCollectTimeout(ctx),
          timeoutMessage: 'Histoire test collection timed out.',
          context: undefined,
        }
      },
      read(vitest) {
        assertVitestRunHasNoUnhandledErrors(vitest)
        const modules = new Map(vitest.state.getTestModules().map(module => [normalize(module.moduleId), module]))
        for (const spec of specs) {
          const module = modules.get(normalize(spec.path))
          const failures = module?.errors() ?? []
          const tasks = module ? [...module.children.allTests()] : []
          const target = { storyId: spec.storyId, variantId: spec.variantId }
          const collection = channel.results.get(getHistoireTargetKey(target))?.collection
            ?? tasks.map(task => (task.meta() as { histoireCollection?: HistoireTestCollectionResult }).histoireCollection).find(Boolean)
          const error = failures.length ? serializeTestErrors(failures)[0] : 'Test collection metadata unavailable'
          completed.set(getHistoireTargetKey(target), { target, collection: !failures.length && collection ? collection : { definitions: [], error } })
        }
        return { execution, variants: targets.map(target => completed.get(getHistoireTargetKey(target))!) }
      },
    })
    validateProjectTestCollection(result, targets)
    return result
  }
  finally {
    await fs.remove(root)
    debugVitestBrowser('collection:complete', { duration: performance.now() - started })
  }
}
