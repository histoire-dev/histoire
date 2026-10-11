import type { HistoireProjectTestCollectionResult } from '@histoire/protocol'
import type { Context } from '../context.js'
import type { CatalogSnapshot } from '../runtime/catalog/types.js'
import type { CollectHistoireTestsOptions } from './types.js'
import { randomUUID } from 'node:crypto'
import { getHistoireTargetKey, HistoireSdkError, validateProjectTestCollection } from '@histoire/protocol'
import { validId } from '../runtime/catalog/lookup.js'
import { debugVitestBrowser } from '../util/browser-debug.js'
import { getCollectTimeout } from '../util/test-timeouts.js'
import { getEmbedSourceId } from '../virtual/embed/identity.js'
import { getTestCollectionCache } from './collection-cache.js'
import { createCollectionDeadline } from './collection-deadline.js'
import { captureTestCollectionEligibility, captureTestCollectionGeneration } from './eligibility/index.js'

/** Collect one captured publication, sharing completed definitions without sharing active cancellation. */
export async function collectGenerationTests(ctx: Context, snapshot: Context, source: CatalogSnapshot | undefined, options: Pick<CollectHistoireTestsOptions, 'storyId' | 'force' | 'onProgress'>, assertSourceOwner: () => void, external: AbortSignal): Promise<HistoireProjectTestCollectionResult> {
  const deadline = createCollectionDeadline(getCollectTimeout(ctx), external)
  const started = performance.now()
  const execution: HistoireProjectTestCollectionResult['execution'] = { runId: randomUUID(), mode: 'server', ...(source ? { sourceId: getEmbedSourceId(ctx.root), epoch: source.epoch, revision: source.revision } : {}) }
  try {
    deadline.assertCurrent()
    if (options.storyId !== undefined && !validId(options.storyId)) throw new HistoireSdkError('INVALID_ARGUMENT', 'Test target IDs must be non-empty strings')
    if (options.force !== undefined && typeof options.force !== 'boolean') throw new HistoireSdkError('INVALID_ARGUMENT', 'Test collection force must be a boolean')
    const stories = snapshot.storyFiles.filter(file => file.story && !file.story.docsOnly && (options.storyId === undefined || file.story.id === options.storyId))
    if (options.storyId !== undefined && !stories.length) throw new HistoireSdkError('STORY_NOT_FOUND', 'Requested story could not be resolved')
    if (options.storyId !== undefined && stories.length > 1) throw new HistoireSdkError('STORY_AMBIGUOUS', 'Requested story ID is ambiguous')
    const targets = stories.flatMap(file => file.story!.variants.map(variant => ({ storyId: file.story!.id, variantId: variant.id })))
    const generation = captureTestCollectionGeneration(ctx)
    const cache = getTestCollectionCache(ctx, source, generation?.token, snapshot.storyFiles)
    const cached = cache?.read(stories.map(file => file.story!.id), options.force) ?? []
    const cachedStories = new Set(cached.map(entry => entry.target.storyId))
    const remaining = stories.filter(file => !cachedStories.has(file.story!.id))
    let eligibility: Awaited<ReturnType<typeof captureTestCollectionEligibility>> | undefined
    /** Cache, streamed results, and final evidence share identical publication fences. */
    function assertCurrent() {
      deadline.assertCurrent()
      assertSourceOwner()
      generation?.assertCurrent()
      eligibility?.assertCurrent()
    }
    /** Stamp current operation provenance while preserving the worker's exact variant subset. */
    function publish(result: HistoireProjectTestCollectionResult) {
      assertCurrent()
      if (result.execution.runId !== execution.runId) throw new HistoireSdkError('INVALID_ARGUMENT', 'Test discovery operation changed')
      options.onProgress?.({ execution, variants: result.variants })
    }
    assertCurrent()
    debugVitestBrowser('collection:cache', { runId: execution.runId, hits: cached.length, misses: targets.length - cached.length, stories: remaining.map(file => file.story!.id) })
    if (cached.length) publish({ execution, variants: cached })
    let variants = cached
    if (remaining.length) {
      const proofStarted = performance.now()
      // Cache hits already carry closed-graph proof from this generation;
      // inspect only misses, without revisiting cached story transforms.
      eligibility = await captureTestCollectionEligibility(ctx, remaining.map(file => file.story!.id), deadline.signal)
      assertCurrent()
      debugVitestBrowser('collection:proof', { runId: execution.runId, duration: performance.now() - proofStarted, targets: targets.length })
      const { collectHistoireProjectTests } = await import('./collect.js')
      assertCurrent()
      const empty = new Set(eligibility.knownEmptyStoryIds)
      const optimizerEntries = snapshot.storyFiles.filter(file => file.story && !file.story.docsOnly && !empty.has(file.story.id)).map(file => file.path)
      const fresh = await collectHistoireProjectTests({ ...snapshot, storyFiles: remaining }, {
        storyId: options.storyId,
        knownEmptyStoryIds: eligibility.knownEmptyStoryIds,
        onProgress: publish,
        collectionRunId: execution.runId,
        collectionDeadline: deadline.until,
        collectionOptimizerEntries: cache?.captureOptimizerEntries(optimizerEntries) ?? optimizerEntries,
        skipStoryScan: true,
        signal: deadline.signal,
        strictCleanup: true,
        isolate: true,
        maxRetries: 0,
      })
      assertCurrent()
      variants = [...cached, ...fresh.variants]
    }
    validateProjectTestCollection({ execution, variants }, targets)
    const entries = new Map(variants.map(entry => [getHistoireTargetKey(entry.target), entry]))
    const result = { execution, variants: targets.map(target => entries.get(getHistoireTargetKey(target))!) }
    validateProjectTestCollection(result, targets)
    assertCurrent()
    cache?.write(result.variants, eligibility?.cacheableStoryIds ?? [], assertCurrent)
    return result
  }
  catch (error) { throw deadline.failure(error) }
  finally {
    deadline.close()
    debugVitestBrowser('collection:operation', { runId: execution.runId, duration: performance.now() - started })
  }
}
