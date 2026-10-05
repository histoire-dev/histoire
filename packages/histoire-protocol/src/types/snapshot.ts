import type { HistoireCatalog, HistoireDiagnostic } from './catalog.js'
import type { HistoireCapabilities, HistoireSourceIdentity, HistoireTarget } from './common.js'
import type { HistoireSettings } from './settings.js'

/** Session connection lifecycle. */
export type HistoireSessionStatus = 'idle' | 'connecting' | 'ready' | 'restarting' | 'disconnected' | 'failed' | 'disposed'

/** Authoritative cleaned state, never live callbacks or instances. */
export interface HistoireStateSnapshot {
  /** Exact state owner. */
  target: HistoireTarget
  /** Runtime document that produced value. */
  runtimeId: string
  /** Structured-clone-safe cleaned projection; may contain cycles. */
  value: Record<string, unknown> | unknown[]
}

/** Rendered CSS-pixel box within primary mount padding box. */
export interface HistoireRect {
  /** Horizontal position. */
  x: number
  /** Vertical position. */
  y: number
  /** Complete width. */
  width: number
  /** Complete height. */
  height: number
}

/** Ready visible variant geometry, including grid cells. */
export interface HistoireViewport extends HistoireRect {
  /** Variant content owner. */
  target: HistoireTarget
  /** Positive rendered-to-logical viewport scale. */
  scale: number
  /** Content box intersected with source and host scroll clips. */
  visibleRect: HistoireRect
}

/** Canonical primary-runtime attachment. */
export interface HistoireRuntimeSnapshot {
  /** Runtime readiness independent of source connection. */
  status: 'absent' | 'mounting' | 'ready' | 'failed' | 'stale'
  /** Owning surface attachment or null. */
  mountId: string | null
  /** Current runtime document or null. */
  runtimeId: string | null
  /** Primary presentation or null before mount. */
  layout: 'single' | 'grid' | null
  /** Ready visible variant boxes; hidden preview has none. */
  viewports: readonly HistoireViewport[]
  /** Selected visible entry, otherwise null. */
  viewport: HistoireViewport | null
}

/** One cleaned event from exact runtime target. */
export interface HistoireEvent {
  /** Monotonic session event sequence. */
  sequence: number
  /** Source event timestamp. */
  timestamp: number
  /** Exact event owner. */
  target: HistoireTarget
  /** Runtime document owner. */
  runtimeId: string
  /** Cleaned application payload. */
  payload: unknown
}

/** Stable read-only session projection published atomically. */
export interface HistoireSnapshot {
  /** Source connection lifecycle. */
  status: HistoireSessionStatus
  /** Retained data no longer known to be current. */
  stale: boolean
  /** Connected book identity or null before handshake. */
  source: HistoireSourceIdentity | null
  /** Last completed catalog, including empty catalog. */
  catalog: HistoireCatalog
  /** Projected collection issues. */
  diagnostics: readonly HistoireDiagnostic[]
  /** Single session-selected target. */
  selection: HistoireTarget | null
  /** Primary runtime attachment/readiness. */
  runtime: HistoireRuntimeSnapshot
  /** Authoritative mirror or null before snapshot. */
  state: HistoireStateSnapshot | null
  /** Current session preferences. */
  settings: HistoireSettings
  /** Source capabilities filtered by selection/readiness. */
  capabilities: HistoireCapabilities
  /** Latest 1,000 events and loss accounting. */
  events: { items: readonly HistoireEvent[], droppedCount: number }
}
