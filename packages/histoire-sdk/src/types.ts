import type {
  HistoireCatalogStory,
  HistoireDocsContent,
  HistoireEvent,
  HistoireHostChannelMessage,
  HistoireJsonValue,
  HistoireReadonly,
  HistoireSearchResult,
  HistoireSelectionInput,
  HistoireSettingsPatch,
  HistoireSnapshot,
  HistoireSourceContent,
  HistoireStateSnapshot,
  HistoireSurface,
  HistoireTestCollectionResult,
  HistoireTestRunSummary,
} from '@histoire/protocol'

export type * from '@histoire/protocol'

/** Opt-in namespace. Subscriptions retire when runtime is replaced/disconnected. */
export interface HistoireHostChannel {
  /** Send bounded JSON to current selected ready primary; never queue/retry. */
  post: (type: string, data: HistoireJsonValue) => Promise<void>
  /** Observe attributed messages; subscribe again after runtime replacement. */
  subscribe: (listener: (message: HistoireHostChannelMessage) => void) => () => void
  /** Saturated local rate, inbound validation, and listener failure count. */
  getDroppedCount: () => number
}

/** Remote book options; construction never accesses DOM. */
export interface HistoireSessionOptions {
  /** Absolute HTTP(S) book base URL. */
  url: string
  /** Optional source-scoped preference namespace. */
  persistenceKey?: string
}

/** Caller-owned surface attachment, including failed mounts. */
export interface HistoireMount {
  /** Unique attachment identity. */
  id: string
  /** Actual view/runtime readiness, never iframe load alone. */
  ready: Promise<void>
  /** Idempotent complete resource teardown. */
  unmount: () => Promise<void>
}

/** Framework-neutral controller shared by iframe and native Vue consumers. */
export interface HistoireSession {
  /** Explicitly connect data-only source bridge. */
  connect: () => Promise<void>
  /** Stable read-only current snapshot. */
  getSnapshot: () => HistoireReadonly<HistoireSnapshot>
  /** Observe future coherent publications; returns unsubscribe. */
  subscribe: (listener: (snapshot: HistoireReadonly<HistoireSnapshot>) => void) => () => void
  /** Metadata-only catalog operations. */
  catalog: {
    /** Read completed source catalog. */
    list: () => Promise<readonly HistoireCatalogStory[]>
    /** Resolve exact unambiguous story. */
    getStory: (storyId: string) => Promise<HistoireCatalogStory>
    /** Search titles/docs without story mounting. */
    search: (query: string) => Promise<readonly HistoireSearchResult[]>
  }
  /** One session-owned selected target. */
  selection: { select: (input: HistoireSelectionInput) => Promise<void> }
  /** Explicit ready-runtime state operations. */
  state: {
    /** Request authoritative cleaned state. */
    get: () => Promise<HistoireStateSnapshot>
    /** Merge projection without replacing live identities. */
    patch: (patch: Record<string, unknown>) => Promise<void>
    /** Restore initial runtime snapshot. */
    reset: () => Promise<void>
  }
  /** Host-owned surface/runtime preferences. */
  settings: { update: (patch: HistoireSettingsPatch) => Promise<void> }
  /** Attributable bounded event stream. */
  events: {
    /** Subscribe to future events, returning unsubscribe. */
    subscribe: (listener: (event: HistoireEvent) => void) => () => void
    /** Clear history and dropped count. */
    clear: () => void
  }
  /** Application namespaces explicitly enabled by source configuration. */
  channels: { open: (name: string) => HistoireHostChannel }
  /** Lazy data-service documentation. */
  docs: { get: (storyId: string) => Promise<HistoireDocsContent> }
  /** Raw data-service or explicit runtime-generated source. */
  source: { get: (input: { storyId: string, variantId?: string, mode: 'raw' | 'dynamic' }) => Promise<HistoireSourceContent> }
  /** Explicit execution modes; never retry/fallback automatically. */
  tests: {
    /** Collect selected ready preview definitions. */
    collect: () => Promise<HistoireTestCollectionResult>
    /** Run captured selected variant. */
    run: (options: { mode: 'preview' | 'server', signal?: AbortSignal }) => Promise<HistoireTestRunSummary>
  }
  /** Reserve runtime synchronously when mounting primary surface. */
  mount: (container: HTMLElement, options: { surface: HistoireSurface }) => HistoireMount
  /** Explicit offscreen primary with real viewport dimensions. */
  createHiddenPreview: () => HistoireMount
  /** Terminal idempotent disposal, rejecting pending work immediately. */
  dispose: () => Promise<void>
}
