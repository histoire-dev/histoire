import type { WorkbenchPluginApi } from '@histoire/plugin-kit'
import type { HistoireCatalogStory, HistoireCatalogVariant, HistoireTarget } from '@histoire/protocol'
import type { ResolvedDesigns, ResolveOptions } from '../designs/resolve.js'
import type { ResolvedDesign } from '../types.js'
import { resolveDesigns } from '../designs/resolve.js'

/** Plugin API members the model uses. */
export type DesignModelApi = Pick<WorkbenchPluginApi, 'preferences' | 'invalidate' | 'signal'> & {
  /** Root context; only the catalog is read. */
  readonly context: Pick<WorkbenchPluginApi['context'], 'catalog'>
}

/** Designs of the stories surfaces asked for, shared by the inspector tab and canvas view. */
export interface DesignModel {
  /**
   * Designs of a variant; `undefined` while its story loads (the first read starts loading).
   * When the story cannot be loaded, `error` holds the reason and both lists are empty.
   */
  get: (target: HistoireTarget) => ResolvedDesigns | undefined
  /** Whether a variant has a design, an invalid entry or a load failure to show; starts loading like `get`. */
  has: (target: HistoireTarget) => boolean
  /** Catalog entry of a loaded variant. */
  variant: (target: HistoireTarget) => HistoireCatalogVariant | undefined
  /** Design selected in the switcher, the first valid one by default. */
  active: (target: HistoireTarget) => ResolvedDesign | undefined
  /** Selects a design by its entry index (`ResolvedDesign.index`). */
  select: (target: HistoireTarget, entryIndex: number) => void
  /** Notified (at most once per microtask) when designs load or the selection changes. */
  subscribe: (listener: () => void) => () => void
  /**
   * Loads a story ahead of the first read, so availability is known before surfaces restore
   * (e.g. a Design tab reopened from the URL). Resolves once loaded or failed.
   */
  preload: (storyId: string) => Promise<void>
}

/**
 * Stories kept and refreshed after catalog publications, most recently read first out last.
 * Surfaces read the stories they show on every render, so shown stories stay within it.
 */
const MAX_CACHED_STORIES = 16

/**
 * Metadata surfaces read from a story; equal signatures mean a refetch changed nothing visible.
 * @param story Catalog story.
 */
function signature(story: HistoireCatalogStory): string {
  return JSON.stringify([story.meta, story.variants.map(variant => [variant.id, variant.title, variant.meta])])
}

/**
 * Message of a failed story fetch.
 * @param error Rejection reason.
 */
function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Story could not be loaded'
}

/**
 * Creates the design model. Stories are fetched lazily from the catalog and the most recently
 * read ones are refetched after each catalog publication; stale data stays readable until the
 * new version arrives, so surfaces never flash empty while a story file is edited.
 * @param api Plugin API.
 * @param options Design resolution settings.
 */
export function createDesignModel(api: DesignModelApi, options: ResolveOptions): DesignModel {
  /** Loaded stories with their metadata signature. */
  const stories = new Map<string, { story: HistoireCatalogStory, signature: string }>()
  /** Failed fetch reason per story id; retried after the next publication. */
  const failures = new Map<string, string>()
  /** Story ids in read order, oldest first; bounded by {@link MAX_CACHED_STORIES}. */
  const recent = new Set<string>()
  /** Story ids with a fetch in flight. */
  const pending = new Set<string>()
  /** In-flight story ids a publication outdated; refetched once their fetch settles. */
  const stale = new Set<string>()
  /** Resolved designs per variant key, dropped whenever its story is replaced. */
  const resolved = new Map<string, ResolvedDesigns>()
  const listeners = new Set<() => void>()
  let notifyQueued = false

  /** Re-evaluates contribution availability and updates mounted views, once per microtask. */
  function notify(): void {
    if (notifyQueued) return
    notifyQueued = true
    queueMicrotask(() => {
      notifyQueued = false
      if (api.signal.aborted) return
      api.invalidate()
      for (const listener of [...listeners]) listener()
    })
  }

  /**
   * Forgets everything cached for one story.
   * @param storyId Story id.
   */
  function drop(storyId: string): void {
    stories.delete(storyId)
    failures.delete(storyId)
    for (const key of [...resolved.keys()]) {
      if (key.startsWith(`${storyId}\0`)) resolved.delete(key)
    }
  }

  /**
   * Marks a story as just read, evicting the least recently read one past the limit.
   * @param storyId Story id.
   */
  function touch(storyId: string): void {
    recent.delete(storyId)
    recent.add(storyId)
    if (recent.size <= MAX_CACHED_STORIES) return
    const oldest = recent.values().next().value as string
    recent.delete(oldest)
    stale.delete(oldest)
    drop(oldest)
  }

  /**
   * Stores a fetched story; surfaces are only notified when its metadata changed.
   * @param storyId Story id.
   * @param story Fetched story.
   */
  function store(storyId: string, story: HistoireCatalogStory): void {
    const next = signature(story)
    const hadFailed = failures.delete(storyId)
    if (stories.get(storyId)?.signature === next && !hadFailed) return
    drop(storyId)
    stories.set(storyId, { story, signature: next })
    notify()
  }

  /**
   * Records a failed fetch; a removed story has no designs, surfaces show the reason.
   * @param storyId Story id.
   * @param error Rejection reason.
   */
  function fail(storyId: string, error: unknown): void {
    const message = errorMessage(error)
    if (failures.get(storyId) === message && !stories.has(storyId)) return
    drop(storyId)
    failures.set(storyId, message)
    notify()
  }

  /**
   * Fetches one story; concurrent requests share one fetch. A refresh requested meanwhile
   * runs once the current fetch settles, so the last publication always wins.
   * @param storyId Story id.
   * @param refresh Requested by a catalog publication.
   */
  function load(storyId: string, refresh: boolean): void {
    if (api.signal.aborted) return
    if (pending.has(storyId)) {
      if (refresh) stale.add(storyId)
      return
    }
    pending.add(storyId)
    // Results of stories evicted meanwhile are dropped: nothing shows them anymore.
    const current = () => !api.signal.aborted && recent.has(storyId)
    api.context.catalog.getStory(storyId).then((story) => {
      if (current()) store(storyId, story)
    }, (error) => {
      if (current()) fail(storyId, error)
    }).finally(() => {
      pending.delete(storyId)
      if (stale.delete(storyId)) load(storyId, true)
    })
  }

  const stop = api.context.catalog.subscribe?.(() => {
    for (const storyId of recent) {
      if (stories.has(storyId) || failures.has(storyId) || pending.has(storyId)) load(storyId, true)
    }
  })
  api.signal.addEventListener('abort', () => {
    stop?.()
    listeners.clear()
  }, { once: true })

  /**
   * Preference key of the selected design of one variant.
   * @param target Variant.
   */
  const preferenceKey = (target: HistoireTarget) => `active:${target.storyId}:${target.variantId}`

  const model: DesignModel = {
    get(target) {
      if (target.variantId === null) return
      touch(target.storyId)
      const failure = failures.get(target.storyId)
      if (failure !== undefined) return { designs: [], issues: [], error: failure }
      const story = stories.get(target.storyId)?.story
      if (!story) {
        load(target.storyId, false)
        return
      }
      const key = `${target.storyId}\0${target.variantId}`
      let designs = resolved.get(key)
      if (!designs) resolved.set(key, designs = resolveDesigns(story, target.variantId, options))
      return designs
    },
    has(target) {
      const designs = model.get(target)
      // A load failure counts too, so the tab can explain it.
      return !!designs && (designs.designs.length > 0 || designs.issues.length > 0 || !!designs.error)
    },
    variant(target) {
      return stories.get(target.storyId)?.story.variants.find(variant => variant.id === target.variantId)
    },
    active(target) {
      const designs = model.get(target)?.designs
      if (!designs?.length) return
      // Preferences are user storage: anything but a known entry index means the first design.
      const stored = api.preferences.get(preferenceKey(target), null)
      return designs.find(design => design.index === stored) ?? designs[0]
    },
    select(target, entryIndex) {
      if (!Number.isInteger(entryIndex) || entryIndex < 0) return
      api.preferences.set(preferenceKey(target), entryIndex)
      notify()
    },
    subscribe(listener) {
      const entry = (): void => listener()
      listeners.add(entry)
      return () => void listeners.delete(entry)
    },
    async preload(storyId) {
      touch(storyId)
      if (stories.has(storyId) || failures.has(storyId)) return
      try {
        const story = await api.context.catalog.getStory(storyId)
        if (!api.signal.aborted) store(storyId, story)
      }
      catch (error) {
        if (!api.signal.aborted) fail(storyId, error)
      }
    },
  }
  return model
}
