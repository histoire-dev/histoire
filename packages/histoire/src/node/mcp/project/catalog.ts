import type { StoryCollectionOutcome } from '../../collect/outcome.js'
import type { Context } from '../../context.js'
import type { CatalogSnapshot, SnapshotOptions } from './snapshot.js'
import { McpDomainError } from '../protocol/errors.js'
import { MCP_LIMITS } from '../protocol/limits.js'
import { createCatalogPager } from './catalog-pages.js'
import { captureCatalogSnapshot } from './snapshot.js'

export type { CatalogListInput } from './catalog-pages.js'

/** Owns immutable catalog publication, retained cursor snapshots and exact target lookup. */
export function createProjectCatalog(options: SnapshotOptions & { root: string, now?: () => number, isActive?: () => boolean }) {
  const now = options.now ?? Date.now
  let current: CatalogSnapshot
  let previous: { snapshot: CatalogSnapshot, expiresAt: number }
  let counter = 0
  let updating = true
  /** Requires a completed initial publication while preserving failed diagnostic reads. */
  function requireSnapshot(expectedRevision?: string) {
    if (!current) throw new McpDomainError('PROJECT_STARTING', 'Project catalog is starting', true)
    if (expectedRevision && expectedRevision !== current.revision) throw new McpDomainError('STALE_REVISION', 'Catalog revision changed', true)
    return current
  }
  /** Resolves exact byte-preserving story identity without silently selecting duplicates. */
  function getStory(storyId: string, expectedRevision?: string) {
    const snapshot = requireSnapshot(expectedRevision)
    const matches = snapshot.stories.filter(story => story.id === storyId)
    if (matches.length > 1) {
      throw new McpDomainError('STORY_AMBIGUOUS', 'Story ID is ambiguous', false, {
        storyId,
      })
    }
    if (!matches.length) {
      throw new McpDomainError(snapshot.failed ? 'COLLECTION_FAILED' : 'STORY_NOT_FOUND', snapshot.failed ? 'Story collection failed' : 'Story not found', snapshot.failed, {
        storyId,
      })
    }
    return { projectId: options.projectId, revision: snapshot.revision, story: matches[0] }
  }
  return {
    /** Last completed snapshot; undefined until initial collection completes. */
    get current() { return current },
    /** Whether execution admission must wait for collection/content publication. */
    get updating() { return updating },
    /** Prevents new execution while keeping previous completed read snapshot usable. */
    markUpdating() { updating = true },
    /** Publishes after full collection/invalidation; unchanged bytes preserve revision. */
    async publish(ctx: Context, outcomes?: ReadonlyMap<string, StoryCollectionOutcome>) {
      const captured = await captureCatalogSnapshot(ctx, options, outcomes && new Map(outcomes))
      if (options.isActive && !options.isActive()) return current
      if (!current || captured.fingerprint !== current.fingerprint) {
        if (current) {
          previous = {
            snapshot: current,
            expiresAt: now() + MCP_LIMITS.cursorRetentionMs,
          }
        }
        current = Object.freeze({ ...captured, revision: `${options.epoch}:${++counter}` })
      }
      updating = false
      return current
    },
    getStory,
    /** Resolves exact scoped variant identity and blocks execution during updates. */
    getTarget(storyId: string, variantId: string, expectedRevision?: string) {
      if (updating) throw new McpDomainError('PROJECT_STARTING', 'Project catalog is updating', true)
      const result = getStory(storyId, expectedRevision)
      const matches = result.story.variants.filter(variant => variant.id === variantId)
      if (matches.length > 1) {
        throw new McpDomainError('STORY_AMBIGUOUS', 'Variant ID is ambiguous within story', false, {
          storyId,
          variantId,
        })
      }
      if (!matches.length || result.story.docsOnly) {
        throw new McpDomainError('VARIANT_NOT_FOUND', 'Variant not found', false, {
          storyId,
          variantId,
        })
      }
      return { ...result, variant: matches[0] }
    },
    /** Shared filtering and opaque cursor authority over current/retained publications. */
    list: createCatalogPager({
      projectId: options.projectId,
      current: requireSnapshot,
      updating: () => updating,
      now,
      retained: revision => previous?.snapshot.revision === revision && previous.expiresAt > now() ? previous.snapshot : undefined,
    }),
  }
}

/** Shared facade type consumed by content, registration and execution slices. */
export type ProjectCatalog = ReturnType<typeof createProjectCatalog>
