import type { CatalogEvents, CatalogListArgs, CatalogListPage, CatalogStateDto, CatalogVariantsArgs, CatalogVariantsPage, CatalogWorkbenchDto } from '@histoire/cli/protocol/catalog'
import type { RuntimeCatalog } from '../../catalog/publication.js'
import type { CatalogSnapshot } from '../../catalog/types.js'
import type { ProjectRuntimeHandle } from '../../types.js'
import { CATALOG_STALE_MESSAGE } from '@histoire/cli/protocol/catalog'
import { TerminalError } from '@histoire/cli/protocol/core'
import { normalizePreviewBase } from '@histoire/protocol'
import { CatalogError } from '../../catalog/types.js'
import { readOffset, takePage } from './paging.js'
import { ambiguousStoryIds, createVariantProjector, projectStory } from './projection.js'
import { searchNeedle, storyOrVariantMatches } from './search.js'

/** Inputs of the per-generation catalog service. */
export interface CatalogServiceOptions {
  /** Active runtime generation; supplies routing facts and the activity fence. */
  handle: Pick<ProjectRuntimeHandle, 'context' | 'server' | 'isActive' | 'onCollection'>
  /** Canonical catalog of the generation. */
  catalog: RuntimeCatalog | undefined
  /** Parent event sink; dropped by the adapter once the generation retires. */
  emit: <K extends keyof CatalogEvents & string>(event: K, data: CatalogEvents[K]) => void
  /** Aborted when the generation is released: stop observing. */
  signal: AbortSignal
}

/** Read-only view of the canonical catalog of one generation. */
export interface CatalogService {
  /** One page of matching stories, all of one revision. */
  list: (args: CatalogListArgs) => CatalogListPage
  /** One page of a story's variants, all of one revision. */
  variants: (args: CatalogVariantsArgs) => CatalogVariantsPage
  /** Lifecycle and counts right now. */
  state: () => CatalogStateDto
}

/** Maps canonical lookup failures to the contracted private-channel codes. */
function lookupError(error: unknown) {
  if (!(error instanceof CatalogError)) return error
  if (error.code === 'STALE_REVISION') return new TerminalError('failed', CATALOG_STALE_MESSAGE)
  if (error.code === 'PROJECT_STARTING') return new TerminalError('unavailable', 'Catalog is not ready')
  return new TerminalError('invalid', error.message)
}

/**
 * Creates the read-only terminal view of the canonical catalog. It reads the catalog
 * attached to the generation (never a second publisher), pages synchronously from one
 * immutable snapshot, and emits `catalog.state` when the revision or the updating
 * fence changes.
 * @param options Generation-scoped capabilities.
 */
export function createCatalogService(options: CatalogServiceOptions): CatalogService {
  const { catalog, handle } = options
  let lastKey: string | undefined

  /** Completed catalog; reads fail while the first collection has not completed. */
  function snapshot(): CatalogSnapshot {
    if (!handle.isActive() || !catalog?.current) throw new TerminalError('unavailable', 'Catalog is not ready')
    return catalog.current
  }

  /** Router facts of the running workbench; absent when the base cannot leave the origin. */
  function workbench(): CatalogWorkbenchDto | undefined {
    try {
      return { base: normalizePreviewBase(handle.server.config.base ?? '/'), routerMode: handle.context.config.routerMode ?? 'history' }
    }
    catch {
      return undefined
    }
  }

  /** Lifecycle summary of the last completed catalog. */
  function state(): CatalogStateDto {
    const current = catalog?.current
    return {
      ...(current ? { revision: current.revision } : {}),
      updating: catalog?.updating ?? true,
      stories: current?.stories.length ?? 0,
      variants: current?.stories.reduce((total, story) => total + story.variants.length, 0) ?? 0,
      ...(current ? { outcome: current.outcome } : {}),
      diagnostics: current?.diagnostics.length ?? 0,
    }
  }

  /** Emits the state when it differs from the last one sent. */
  function publishState() {
    if (options.signal.aborted || !handle.isActive()) return
    const next = state()
    const key = JSON.stringify(next)
    if (key === lastKey) return
    lastKey = key
    options.emit('catalog.state', next)
  }

  // Collection handlers run after the attachment's own handler, so `updating` and the
  // revision are already settled when this observer reads them.
  const offCollection = handle.onCollection(publishState)
  const offCatalog = catalog?.subscribe(publishState)
  options.signal.addEventListener('abort', () => {
    offCollection()
    offCatalog?.()
  }, { once: true })

  return {
    state,
    list(args) {
      const current = snapshot()
      // A cursor of an older revision never continues: the parent restarts the read.
      if (args.expectedRevision !== undefined && args.expectedRevision !== current.revision) throw new TerminalError('failed', CATALOG_STALE_MESSAGE)
      const needle = searchNeedle(args.query)
      // Search covers the complete canonical catalog, not only the page already loaded.
      const matching = needle ? current.stories.filter(story => storyOrVariantMatches(story, needle)) : current.stories
      const offset = readOffset(args.cursor, matching.length)
      const ambiguous = ambiguousStoryIds(current)
      const { page, next } = takePage(matching, offset, args.limit, story => projectStory(story, ambiguous, needle))
      const workbenchFacts = workbench()
      return { revision: current.revision, state: state(), ...(workbenchFacts ? { workbench: workbenchFacts } : {}), total: matching.length, stories: page, ...(next ? { next } : {}) }
    },
    variants(args) {
      const current = snapshot()
      let story: CatalogSnapshot['stories'][number]
      try {
        story = catalog!.getStory(args.storyId, args.expectedRevision).story
      }
      catch (error) {
        throw lookupError(error)
      }
      const offset = readOffset(args.cursor, story.variants.length)
      const { page, next } = takePage(story.variants, offset, args.limit, createVariantProjector(story, searchNeedle(args.query)))
      return { revision: current.revision, storyId: story.id, total: story.variants.length, variants: page, ...(next ? { next } : {}) }
    },
  }
}
