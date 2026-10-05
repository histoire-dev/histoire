import type { HistoireCapabilities, HistoireCapabilityName, HistoireHostChannelMessage, HistoireSettings, HistoireSettingsPatch, HistoireSnapshot, HistoireSourceDescriptor, HistoireTarget } from '@histoire/protocol'
import type { HistoireSessionAdapters, HistoireSourceConnection, HistoireSurfaceConnection } from '../adapters/types.js'
import type { HistoireMount, HistoireSession, HistoireSessionOptions } from '../types.js'
import { HistoireSdkError } from '@histoire/protocol'
import { createSettingsPersistence } from '../persistence/storage.js'
import { OperationOwner } from './ownership.js'
import { copyProjection, effectiveCapabilities, freezeProjection, initialSnapshot } from './snapshot.js'

/** One attachment; primary ownership survives until complete async cleanup. */
export interface OwnedMount {
  /** Public caller handle. */
  handle: HistoireMount
  /** First-party transport and element owner. */
  transport: HistoireSurfaceConnection
  /** Listener cleanup. */
  unsubscribe: () => void
  /** Whether notifications still belong to active attachment. */
  active: boolean
  /** Hidden primaries never expose visible variant geometry. */
  hidden: boolean
  /** Current document independent of selection's temporary mounting projection. */
  runtimeId: string | null
  /** Retired documents can never reclaim attachment, even with delayed mounting. */
  retiredRuntimeIds: Set<string>
  /** Idempotent cleanup promise. */
  closing?: Promise<void>
}

/** Framework-neutral private state shared by controller service modules. */
export class SessionContext {
  /** Stable session identity, independent of target IDs. */
  readonly sessionId = `histoire-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  /** Normalized source book base. */
  readonly url: string
  /** First-party adapters; no construction side effects. */
  readonly adapters: HistoireSessionAdapters
  /** Local parent API for first-party surface proxies; never serialized. */
  session: HistoireSession | null = null
  /** Stable immutable projection. */
  snapshot: HistoireSnapshot = initialSnapshot()
  /** Negotiated engine support before runtime readiness filtering. */
  engine: HistoireCapabilities | null = null
  /** Current detached source metadata; never mutate adapter-owned descriptor getters. */
  descriptor: HistoireSourceDescriptor | null = null
  /** Active data bridge, absent until explicit connect. */
  connection: HistoireSourceConnection | null = null
  /** Exact source listener cleanup. */
  unsubscribeSource: (() => void) | null = null
  /** Session snapshot observers. */
  readonly listeners = new Set<(snapshot: Readonly<HistoireSnapshot>) => void>()
  /** Event observers. */
  readonly eventListeners = new Set<(event: HistoireSnapshot['events']['items'][number]) => void>()
  /** Application relay owned by this session, not any framework/global store. */
  deliverChannel?: (message: HistoireHostChannelMessage) => void
  /** Owned pending work. */
  readonly operations = new OperationOwner()
  /** Per-story remembered explicit/default variant. */
  readonly remembered = new Map<string, string>()
  /** Owned surface registry. */
  readonly mounts = new Map<string, OwnedMount>()
  /** Synchronously reserved primary attachment. */
  primaryId: string | null = null
  /** Selection lifetime; same target can acquire a new document. */
  selectionVersion = 0
  /** Actual runtime document lifetime. */
  runtimeVersion = 0
  /** Mount allocation counter. */
  mountCounter = 0
  /** Monotonic attributable event counter. */
  eventCounter = 0
  /** Explicit host edits win over later source defaults and persisted preferences. */
  explicitSettings: HistoireSettingsPatch = {}
  /** One preference application per document/value; concurrent readiness coalesces. */
  settingsSync: { mountId: string, runtimeId: string, settings: HistoireSettings, promise: Promise<void> } | null = null
  /** Opt-in lazy preference persistence. */
  readonly persistence: ReturnType<typeof createSettingsPersistence>

  /** Validate URL without window/document/storage access. */
  constructor(options: HistoireSessionOptions, adapters: HistoireSessionAdapters) {
    let url: URL
    try {
      url = new URL(options.url)
    }
    catch { throw new HistoireSdkError('INVALID_ARGUMENT', 'Source URL must be absolute HTTP(S).') }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new HistoireSdkError('INVALID_ARGUMENT', 'Source URL must be an HTTP(S) book base without credentials, query or fragment.')
    }
    if (options.persistenceKey !== undefined && typeof options.persistenceKey !== 'string') throw new HistoireSdkError('INVALID_ARGUMENT', 'Persistence key must be a string.')
    if (!url.pathname.endsWith('/')) url.pathname += '/'
    this.url = url.href
    this.adapters = adapters
    this.persistence = createSettingsPersistence(this.url, options.persistenceKey, adapters.storage)
  }

  /** Publish one coherent immutable replacement; isolate subscriber exceptions. */
  publish(patch: Partial<HistoireSnapshot>): void {
    const next = { ...this.snapshot, ...patch }
    next.capabilities = effectiveCapabilities(next, this.engine)
    this.snapshot = freezeProjection(next)
    for (const listener of this.listeners) {
      try {
        listener(this.snapshot)
      }
      catch { /* Consumer callbacks cannot interrupt transport ownership. */ }
    }
  }

  /** Reject terminal access before any operation/resource creation. */
  assertActive(): void {
    if (this.snapshot.status === 'disposed') throw new HistoireSdkError('DISPOSED', 'Session disposed.')
  }

  /** Require explicit successful source connection. */
  assertConnected(): HistoireSourceConnection {
    this.assertActive()
    if (!this.connection || this.snapshot.status !== 'ready') throw new HistoireSdkError('NOT_CONNECTED', 'Session is not connected.')
    return this.connection
  }

  /** Check source support separately from runtime requirement. */
  assertCapability(name: HistoireCapabilityName): void {
    this.assertConnected()
    const capability = this.engine?.[name]
    if (!capability?.available) throw new HistoireSdkError('CAPABILITY_UNAVAILABLE', `Source does not support ${name}.`, { capability: name, ...(capability?.reason ? { reason: capability.reason } : {}) })
  }

  /** Require exact selected variant without fabricating a target. */
  selected(): HistoireTarget {
    this.assertConnected()
    if (this.snapshot.selection?.variantId == null) throw new HistoireSdkError('SELECTION_REQUIRED', 'Select a story variant first.')
    return this.snapshot.selection
  }

  /** Resolve exact lookup and reject duplicate IDs before mutation. */
  story(storyId: string) {
    this.assertConnected()
    if (typeof storyId !== 'string') throw new HistoireSdkError('INVALID_ARGUMENT', 'Story ID must be a string.')
    const matches = this.snapshot.catalog.stories.filter(story => story.id === storyId)
    if (!matches.length) throw new HistoireSdkError('STORY_NOT_FOUND', 'Story ID not found.', { storyId })
    if (matches.length !== 1) throw new HistoireSdkError('STORY_AMBIGUOUS', 'Story ID is ambiguous.', { storyId })
    return matches[0]
  }

  /** Copy validated incoming projection without freezing source adapters. */
  copy<T>(value: T): T { return freezeProjection(copyProjection(value)) }
}
