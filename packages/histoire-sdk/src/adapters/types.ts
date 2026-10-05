import type {
  HistoireEvent,
  HistoireHostChannelMessage,
  HistoireRuntimeSnapshot,
  HistoireSettings,
  HistoireSourceDescriptor,
  HistoireStateSnapshot,
  HistoireSurface,
  HistoireTarget,
  HistoireViewport,
} from '@histoire/protocol'
import type { HistoireMountChannel } from '../mounts/channel.js'
import type { HistoireSession } from '../types.js'

/** Captured ownership supplied to every first-party transport operation. */
export interface HistoireRequestCapture {
  /** Owning browser session. */
  sessionId: string
  /** Connected data bridge lifetime. */
  connectionId: string
  /** Stable book identity. */
  sourceId: string
  /** Source generation. */
  epoch: string
  /** Completed catalog/content revision. */
  revision: string
  /** Surface attachment, absent for data operations. */
  mountId?: string
  /** Story runtime document, absent for data operations. */
  runtimeId?: string
  /** Exact operation target when applicable. */
  target?: HistoireTarget
  /** Parent-owned selection generation for first-party surface intents. */
  selectionVersion?: number
  /** Controller-owned cancellation, including caller cancellation. */
  signal: AbortSignal
}

/** Finite requests supported by injected source/runtime adapters. */
export type HistoireSessionCommand = 'catalog.search' | 'selection.select' | 'state.get' | 'state.patch' | 'state.reset' | 'controls.preset' | 'settings.update' | 'events.clear' | 'docs.get' | 'source.get' | 'tests.collect' | 'tests.run' | 'openInEditor' | 'channel.post'

/** Validated adapter notification ownership; SDK still checks current lifetime. */
export interface HistoireNotificationOwner {
  /** Connected data bridge lifetime. */
  connectionId: string
  /** Stable book identity. */
  sourceId: string
  /** Source generation. */
  epoch: string
  /** Completed source revision. */
  revision: string
  /** Originating surface when present. */
  mountId?: string
  /** Runtime document when present. */
  runtimeId?: string
}

/** Narrow notifications after transport schema/origin/port validation. */
export type HistoireSessionNotification = HistoireNotificationOwner & (
  { type: 'catalog', descriptor: HistoireSourceDescriptor }
  | { type: 'disconnect' }
  | { type: 'runtime', runtime: HistoireRuntimeSnapshot }
  | { type: 'layout', viewports: readonly HistoireViewport[] }
  | { type: 'state', state: HistoireStateSnapshot }
  | { type: 'event', event: HistoireEvent }
  | { type: 'channel', message: HistoireHostChannelMessage }
  | { type: 'dropped', count: number, stale?: boolean }
)

/** Shared request/subscription/cleanup lifecycle for first-party transports. */
export interface HistoireTransport {
  /** Negotiated port lifetime, distinct for data bridge and every surface. */
  id: string
  /** Perform one correlated request; never retry execution automatically. */
  request: <T = unknown>(command: HistoireSessionCommand, payload: unknown, capture: HistoireRequestCapture) => Promise<T>
  /** Observe validated notifications, returning complete listener cleanup. */
  subscribe: (listener: (notification: HistoireSessionNotification) => void) => () => void
  /** Complete owned transport teardown; observe abandoned request work. */
  close: () => Promise<void> | void
}

/** Data-only connection; source adapter never executes stories implicitly. */
export interface HistoireSourceConnection extends HistoireTransport {
  /** Unique connected bridge lifetime. */
  id: string
  /** Completed source metadata obtained during explicit handshake. */
  descriptor: HistoireSourceDescriptor
  /** Optional portable source preference defaults. */
  initialSettings?: Partial<HistoireSettings>
}

/** Surface transport owns its elements/ports, never caller session. */
export interface HistoireSurfaceConnection extends HistoireTransport {
  /** Finite first-party controls UI relay, absent on data/primary transports. */
  channel?: HistoireMountChannel
  /** View readiness; primary surfaces return actual runtime identity. */
  ready: Promise<HistoireRuntimeSnapshot | void>
}

/** Explicit source connection input; safe to construct without browser globals. */
export interface HistoireConnectContext {
  /** Normalized source base URL. */
  url: string
  /** Owning session identity. */
  sessionId: string
  /** Cancellation during connection or disposal. */
  signal: AbortSignal
}

/** Synchronously captured mount input before any element creation. */
export interface HistoireMountContext {
  /** Local parent controller for validated view intents/subscriptions; never wire data. */
  session: HistoireSession
  /** Owning session. */
  sessionId: string
  /** Unique attachment. */
  mountId: string
  /** Requested first-party view. */
  surface: HistoireSurface
  /** Explicit hidden primary request. */
  hidden: boolean
  /** Caller-owned container; absent for adapter-owned hidden container. */
  container?: HTMLElement
  /** Connected data source. */
  source: HistoireSourceConnection
  /** Captured selected target. */
  target: HistoireTarget | null
  /** Current host preferences. */
  settings: HistoireSettings
}

/** Optional storage injection avoids browser assumptions in controller tests. */
export interface HistoirePreferenceStorage {
  /** Read saved JSON or null. */
  getItem: (key: string) => string | null
  /** Persist validated settings only. */
  setItem: (key: string, value: string) => void
}

/** Unsupported public loader seam, reserved for first-party adapters. */
export interface HistoireSessionAdapters {
  /** Connect metadata/content without importing story modules in host. */
  connect: (context: HistoireConnectContext) => Promise<HistoireSourceConnection>
  /** Create one surface after controller synchronously reserves ownership. */
  mount?: (context: HistoireMountContext) => HistoireSurfaceConnection
  /** Optional lazily evaluated preference storage provider. */
  storage?: () => HistoirePreferenceStorage | undefined
}
