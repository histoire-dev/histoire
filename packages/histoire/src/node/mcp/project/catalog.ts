import type { StoryCollectionOutcome } from '../../collect/outcome.js'
import type { Context } from '../../context.js'
import type { RuntimeCatalog } from '../../runtime/catalog/publication.js'
import type { CatalogSnapshot, SnapshotOptions } from './snapshot.js'
import { lookupStory, lookupTarget } from '../../runtime/catalog/lookup.js'
import { createRuntimeCatalog } from '../../runtime/catalog/publication.js'
import { CatalogError } from '../../runtime/catalog/types.js'
import { McpDomainError } from '../protocol/errors.js'
import { MCP_LIMITS } from '../protocol/limits.js'
import { createCatalogPager } from './catalog-pages.js'
import { mcpCapturePolicy, projectMcpSnapshot } from './projection.js'

export type { CatalogListInput } from './catalog-pages.js'

/** MCP adapter keeps cursor retention, wire quotas and containment outside shared provider. */
export function createProjectCatalog(options: SnapshotOptions & { root: string, now?: () => number, isActive?: () => boolean, provider?: RuntimeCatalog }) {
  const now = options.now ?? Date.now
  const provider = options.provider ?? createRuntimeCatalog({ ...options, ...mcpCapturePolicy })
  let projected: CatalogSnapshot
  let source: CatalogSnapshot
  let previous: { snapshot: CatalogSnapshot, expiresAt: number }
  /** Applies access projection once for each immutable publication. */
  function current() {
    if (provider.current && source !== provider.current) {
      if (projected) previous = { snapshot: projected, expiresAt: now() + MCP_LIMITS.cursorRetentionMs }
      source = provider.current
      projected = projectMcpSnapshot(source, options.root, options.secret)
    }
    return projected
  }
  /** Maps shared typed lookup failures to established MCP domain errors. */
  function lookup<T>(operation: () => T): T {
    try {
      return operation()
    }
    catch (error) {
      if (error instanceof CatalogError) throw new McpDomainError(error.code as any, error.message, error.retryable, error.data)
      throw error
    }
  }
  /** Requires a completed initial publication while keeping diagnostics readable. */
  function requireSnapshot(expectedRevision?: string) {
    const value = current()
    if (!value) throw new McpDomainError('PROJECT_STARTING', 'Project catalog is starting', true)
    if (expectedRevision && expectedRevision !== value.revision) throw new McpDomainError('STALE_REVISION', 'Catalog revision changed', true)
    return value
  }
  return {
    /** Most recent completed bounded access projection. */
    get current() { return current() },
    /** Admission follows canonical collection/publication readiness. */
    get updating() { return provider.updating },
    /** Marks canonical source updating while preserving completed read data. */
    markUpdating() { provider.markUpdating() },
    /** Compatibility publication delegates collection/content capture to canonical engine. */
    async publish(ctx: Context, outcomes?: ReadonlyMap<string, StoryCollectionOutcome>) {
      await provider.publish(ctx, outcomes)
      return current()
    },
    /** Resolves exact metadata ID using canonical shared lookup semantics. */
    getStory(storyId: string, expectedRevision?: string) {
      requireSnapshot(expectedRevision)
      return { ...lookup(() => lookupStory(current(), storyId, expectedRevision)), projectId: options.projectId }
    },
    /** Resolves exact scoped executable target using canonical admission readiness. */
    getTarget(storyId: string, variantId: string, expectedRevision?: string) {
      if (provider.updating) throw new McpDomainError('PROJECT_STARTING', 'Project catalog is updating', true)
      return { ...lookup(() => lookupTarget(requireSnapshot(expectedRevision), storyId, variantId, expectedRevision)), projectId: options.projectId }
    },
    /** Opaque cursor authority stays inside MCP adapter. */
    list: createCatalogPager({ projectId: options.projectId, current: requireSnapshot, updating: () => provider.updating, now, retained: revision => previous?.snapshot.revision === revision && previous.expiresAt > now() ? previous.snapshot : undefined }),
  }
}

/** Existing project facade remains compatible for registration and execution consumers. */
export type ProjectCatalog = ReturnType<typeof createProjectCatalog>
