import type { StoryCollectionOutcome } from '../../collect/outcome.js'
import type { Context } from '../../context.js'
import type { CatalogSnapshot, SnapshotOptions } from './types.js'
import { normalizeHistoireMatrixHint } from '@histoire/protocol'
import { lookupStory, lookupTarget } from './lookup.js'
import { captureCatalogSnapshot } from './snapshot.js'
import { CatalogError } from './types.js'

/** One generation-owned completed catalog; adapters own paging and transport policies. */
export function createRuntimeCatalog(options: SnapshotOptions & { root: string, isActive?: () => boolean }) {
  let current: CatalogSnapshot
  let updating = true
  let counter = 0
  let batch = 0
  let publication: Promise<unknown> = Promise.resolve()
  const listeners = new Set<(snapshot: CatalogSnapshot) => void>()
  return {
    /** Last completed detached snapshot; absent before first completion. */
    get current() { return current },
    /** A new collection/content batch blocks execution admission. */
    get updating() { return updating },
    /** Retains last completed reads while blocking execution. */
    markUpdating() {
      updating = true
      batch++
    },
    /** Observes future completed changes without implicit callback. */
    subscribe(listener: (snapshot: CatalogSnapshot) => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    /** Serializes snapshots so slower previous reads cannot overwrite later publications. */
    publish(ctx: Context, outcomes?: ReadonlyMap<string, StoryCollectionOutcome>): Promise<CatalogSnapshot> {
      const capturedBatch = batch
      const capturedOutcomes = outcomes && new Map(outcomes)
      const capturedContext = { ...ctx, storyFiles: ctx.storyFiles.map(file => ({ ...file, treePath: file.treePath?.slice(), story: file.story && { ...file.story, layout: file.story.layout && { ...file.story.layout }, matrix: normalizeHistoireMatrixHint(file.story.matrix), variants: file.story.variants.map(variant => ({ ...variant })) }, markdownFile: file.markdownFile && { ...file.markdownFile } })) }
      const work = publication.catch(() => {}).then(async () => {
        if (options.isActive && !options.isActive()) return current
        const captured = await captureCatalogSnapshot(capturedContext, { ...options, contentContext: ctx }, capturedOutcomes)
        if (capturedBatch !== batch || (options.isActive && !options.isActive())) return current
        if (!current || captured.fingerprint !== current.fingerprint) {
          current = Object.freeze({ ...captured, revision: `${options.epoch}:${++counter}` })
          updating = false
          for (const listener of [...listeners]) {
            try {
              listener(current)
            }
            catch (error) { console.error(error) }
          }
        }
        if (capturedBatch === batch) updating = false
        return current
      })
      publication = work
      return work
    },
    /** Resolves exact metadata target against completed publication. */
    getStory(storyId: string, expectedRevision?: string) { return lookupStory(current, storyId, expectedRevision) },
    /** Resolves executable target only after current batch completed. */
    getTarget(storyId: string, variantId: string, expectedRevision?: string) {
      if (updating) throw new CatalogError('PROJECT_STARTING', 'Project catalog is updating', true)
      return lookupTarget(current, storyId, variantId, expectedRevision)
    },
  }
}

/** Canonical generation catalog consumed by Node, browser source, and MCP adapters. */
export type RuntimeCatalog = ReturnType<typeof createRuntimeCatalog>
