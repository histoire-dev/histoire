import type { TerminalBridge } from '../bridge.js'
import type { ProgressState } from '../progress/state.js'
import type { CatalogStateDto, CatalogStoryDto, CatalogVariantDto, CatalogWorkbenchDto } from '../protocol/catalog.js'
import type { CatalogClient } from './client.js'
import type { PagedSnapshot } from './paged.js'
import { isCatalogState } from '../protocol/catalog.js'
import { TerminalError } from '../protocol/core.js'
import { createCatalogClient, isRetiredCatalogRead, isStaleCatalogRead } from './client.js'
import { createPagedReader } from './paged.js'

/** Most stories kept loaded; selection pursuit may exceed it so a selected story is never lost. */
const MAX_LOADED_STORIES = 2000

/** Inputs of the catalog state. */
export interface StoriesStateOptions {
  /** Command bridge; its events carry the catalog revisions. */
  bridge: Pick<TerminalBridge, 'send' | 'subscribe'>
  /** Generation and readiness mirror. */
  progress: Pick<ProgressState, 'snapshot' | 'subscribe'>
  /** Repaint hook, called after any change. */
  changed?: () => void
  /** Replaces the client (tests only). */
  client?: CatalogClient
}

/** Everything the stories screen and the panel know about the catalog of the current generation. */
export interface StoriesView {
  /** `waiting` while no runtime of the current generation is ready. */
  status: 'waiting' | PagedSnapshot<CatalogStoryDto>['status']
  /** Why the latest read failed. */
  problem?: string
  /** Applied search text. */
  query: string
  /** Revision of the stories shown. */
  revision?: string
  /** Lifecycle and counts of the whole catalog. */
  catalog?: CatalogStateDto
  /** Routing facts for building workbench URLs. */
  workbench?: CatalogWorkbenchDto
  /** Generation the rows belong to. */
  generation?: string
  /** Loaded stories, all of one revision. */
  stories: readonly CatalogStoryDto[]
  /** Stories matching the query across the whole catalog. */
  total: number
  /** More pages exist. */
  hasMore: boolean
}

/** Variants of the opened story. */
export interface VariantsView {
  /** Story whose variants are read; undefined while the stories list is shown. */
  storyId?: string
  /** `idle` when no story is open. */
  status: PagedSnapshot<CatalogVariantDto>['status']
  /** Why the latest read failed (e.g. the story vanished). */
  problem?: string
  /** Revision of the variants shown. */
  revision?: string
  /** Loaded variants, all of one revision. */
  variants: readonly CatalogVariantDto[]
  /** Variants of the story. */
  total: number
  /** More pages exist. */
  hasMore: boolean
}

/** Maps a failed catalog read to the reader's reaction. */
function classify(error: unknown) {
  if (isStaleCatalogRead(error)) return 'stale' as const
  if (isRetiredCatalogRead(error)) return 'ignore' as const
  return { problem: error instanceof TerminalError && error.code === 'unavailable' ? 'Catalog is not ready' : error instanceof Error ? error.message : String(error) }
}

/**
 * Session-lifetime, revision-safe cache of the catalog browser. Pages are read on demand
 * from the child's canonical catalog; a catalog revision event or a stale answer restarts
 * the read, so rows of two revisions are never combined. Everything is dropped as soon as
 * the runtime generation changes: nothing is actionable until the successor's catalog
 * answers, while the selection itself (kept by ID in the view) survives unresolved.
 * @param options Bridge, progress mirror and repaint hook.
 */
export function createStoriesState(options: StoriesStateOptions) {
  const client = options.client ?? createCatalogClient(options.bridge)
  const listeners = new Set<() => void>()
  let generation: string | undefined
  let query = ''
  let catalog: CatalogStateDto | undefined
  let workbench: CatalogWorkbenchDto | undefined
  let openStoryId: string | undefined
  let wantedStory: () => string | undefined = () => undefined
  let wantedVariant: () => string | undefined = () => undefined
  let selectStory: (id: string | undefined) => void = () => {}
  /** A search was applied and its first page has not landed yet. */
  let searchPending = false
  let disposed = false

  /** Notifies subscribers and the repaint hook; faulty listeners never break ingestion. */
  function notify() {
    options.changed?.()
    for (const listener of [...listeners]) {
      try {
        listener()
      }
      catch {}
    }
  }

  const stories = createPagedReader({
    read: ({ cursor, expectedRevision }) => client.list({ ...(query ? { query } : {}), ...(cursor ? { cursor, expectedRevision } : {}) }),
    select: page => ({ items: page.stories, revision: page.revision, total: page.total, next: page.next }),
    classify,
    idOf: story => story.id,
    wanted: () => wantedStory(),
    accepted(page) {
      catalog = page.state
      workbench = page.workbench
      // A selection the new results do not contain is replaced by the first match before the reader
      // goes looking for it across pages (`select` runs before the pursuit of the wanted row).
      if (searchPending) {
        searchPending = false
        const current = wantedStory()
        if (query && !page.stories.some(story => story.id === current)) selectStory(page.stories[0]?.id)
      }
      // The variants shown must belong to the revision of the stories around them.
      if (openStoryId && variants.snapshot().revision !== page.revision) void variants.restart()
    },
    changed: notify,
    maxItems: MAX_LOADED_STORIES,
  })

  const variants = createPagedReader({
    read: ({ cursor, expectedRevision }) => client.variants({ storyId: openStoryId!, ...(query ? { query } : {}), ...(cursor ? { cursor, expectedRevision } : {}) }),
    select: page => ({ items: page.variants, revision: page.revision, total: page.total, next: page.next }),
    classify,
    idOf: variant => variant.id,
    wanted: () => wantedVariant(),
    accepted(page) {
      // A variants page of a newer revision than the stories list: refresh the list too.
      const listed = stories.snapshot().revision
      if (listed !== undefined && listed !== page.revision) void stories.restart()
    },
    changed: notify,
  })

  /** Drops every row: the runtime that produced them is gone. */
  function reset() {
    catalog = undefined
    workbench = undefined
    stories.reset()
    variants.reset()
  }

  /** Follows the runtime: a new or restarted generation clears, a ready one is read. */
  function onProgress() {
    const { generation: current, status } = options.progress.snapshot()
    const ready = status === 'ready' && current !== undefined
    if (generation !== current || !ready) {
      const changedGeneration = generation !== current
      generation = current
      if (changedGeneration || stories.snapshot().items.length || catalog) reset()
    }
    if (ready && stories.snapshot().status === 'idle') {
      void stories.restart()
      if (openStoryId) void variants.restart()
    }
    notify()
  }

  const offProgress = options.progress.subscribe(onProgress)
  const offEvents = options.bridge.subscribe(({ event, data, generation: from }) => {
    if (event !== 'catalog.state' || from !== generation || !isCatalogState(data)) return
    const known = catalog?.revision
    catalog = data
    // A new revision restarts the reads; an `updating` flip only repaints.
    if (data.revision !== undefined && known !== data.revision && stories.snapshot().status !== 'idle') {
      void stories.restart()
      if (openStoryId) void variants.restart()
    }
    notify()
  })
  onProgress()

  return {
    /** Current catalog view for the stories list. */
    view(): StoriesView {
      const snapshot = stories.snapshot()
      const { status } = options.progress.snapshot()
      return { status: status === 'ready' ? snapshot.status : 'waiting', problem: snapshot.problem, query, revision: snapshot.revision, catalog, workbench, generation, stories: snapshot.items, total: snapshot.total, hasMore: snapshot.hasMore }
    },
    /** Current view of the opened story's variants. */
    variants(): VariantsView {
      const snapshot = variants.snapshot()
      return { storyId: openStoryId, status: openStoryId ? snapshot.status : 'idle', problem: snapshot.problem, revision: snapshot.revision, variants: snapshot.items, total: snapshot.total, hasMore: snapshot.hasMore }
    },
    /**
     * Registers the selection providers; reads keep loading pages until the selected row is present.
     * @param story Selected story ID.
     * @param variant Selected variant ID.
     * @param select Selects a story ID; called with the first match when a search's results land.
     */
    keepVisible(story: () => string | undefined, variant: () => string | undefined, select?: (id: string | undefined) => void) {
      wantedStory = story
      wantedVariant = variant
      if (select) selectStory = select
    },
    /** Applies a search; the child filters its complete catalog, so matches beyond loaded pages are found. */
    search(text: string) {
      if (text === query) return
      query = text
      searchPending = true
      void stories.restart()
      if (openStoryId) void variants.restart()
    },
    /** Opens (or, with `undefined`, closes) the variants of a story. */
    openStory(storyId: string | undefined) {
      openStoryId = storyId
      variants.reset()
      if (storyId !== undefined && stories.snapshot().status !== 'idle') void variants.restart()
      notify()
    },
    /** Loads the next page of stories. */
    moreStories: () => stories.more(),
    /** Loads the next page of the opened story's variants. */
    moreVariants: () => variants.more(),
    /** Reads again from the first page (manual refresh). */
    refresh() {
      void stories.restart()
      if (openStoryId) void variants.restart()
    },
    /** Observes changes. Returns an unsubscribe function. */
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    /** Stops following the runtime. */
    dispose() {
      if (disposed) return
      disposed = true
      offProgress()
      offEvents()
      listeners.clear()
    },
  }
}

/** Catalog state created by {@link createStoriesState}. */
export type StoriesState = ReturnType<typeof createStoriesState>
