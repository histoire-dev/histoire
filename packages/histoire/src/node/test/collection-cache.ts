import type { HistoireProjectTestCollectionResult } from '@histoire/protocol'
import type { ServerStoryFile } from '@histoire/shared'
import type { Context } from '../context.js'

/** Serialized evidence is retained only for one exact publication and dependency generation. */
interface CollectionCache {
  /** Immutable catalog publication owning every entry. */
  source: object
  /** Opaque eligibility-service dependency generation. */
  generation: object
  /** Complete successful variant inventory for each executable story. */
  stories: Map<string, HistoireProjectTestCollectionResult['variants']>
  /** Stable scan roots for this publication; never mounted by cache admission. */
  optimizerEntries?: string[]
}

/** Live context ownership prevents cache evidence crossing config restarts or projects. */
const caches = new WeakMap<Context, CollectionCache>()

/** Read/write detached definitions without retaining any browser, handler, or runner resource. */
export function getTestCollectionCache(ctx: Context, source: object | undefined, generation: object | undefined, inventory: ServerStoryFile[]) {
  if (!source || !generation) return undefined
  let cache = caches.get(ctx)
  if (!cache || cache.source !== source || cache.generation !== generation) {
    cache = { source, generation, stories: new Map() }
    caches.set(ctx, cache)
  }
  const stories = new Map(inventory.filter(file => file.story && !file.story.docsOnly).map(file => [file.story!.id, file.story!]))
  for (const id of cache.stories.keys()) {
    if (!stories.has(id)) cache.stories.delete(id)
  }
  return {
    /** Cache misses may shrink without resetting Vite's existing dependency cache. */
    captureOptimizerEntries(entries: string[]): string[] {
      cache.optimizerEntries ??= [...entries]
      return [...cache.optimizerEntries]
    },
    /** Forced refresh removes requested evidence before starting new mounts. */
    read(ids: string[], force = false): HistoireProjectTestCollectionResult['variants'] {
      if (force) {
        for (const id of ids) cache.stories.delete(id)
      }
      return structuredClone(ids.flatMap(id => cache.stories.get(id) ?? []))
    },
    /** Caller confirms cleanup, cancellation, and provenance before this atomic admission. */
    write(variants: HistoireProjectTestCollectionResult['variants'], cacheableStoryIds: string[], assertCurrent: () => void) {
      const admitted = new Map<string, HistoireProjectTestCollectionResult['variants']>()
      for (const id of cacheableStoryIds) {
        const story = stories.get(id)
        const entries = variants.filter(entry => entry.target.storyId === id)
        if (!story || entries.length !== story.variants.length || entries.some(entry => entry.collection.error)) continue
        if (!story.variants.every(variant => entries.some(entry => entry.target.variantId === variant.id))) continue
        admitted.set(id, structuredClone(entries))
      }
      // Cloning can consume the final budget synchronously. Fence after all
      // detached evidence is prepared, before admitting any story atomically.
      assertCurrent()
      for (const [id, entries] of admitted) cache.stories.set(id, entries)
    },
  }
}
