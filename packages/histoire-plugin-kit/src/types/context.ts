import type { HistoireReadonly, HistoireSnapshot, HistoireTarget } from '@histoire/protocol'
import type { Disposer } from './common.js'
import type { CanvasService, CatalogService, DevEventService, NavigationService, TestsService } from './services.js'

/**
 * Optional services a host may provide. A missing capability means the matching
 * context property is absent; accessing it never throws.
 */
export type WorkbenchCapability =
  | 'catalog'
  | 'navigation'
  | 'devEvents'
  | 'canvas'
  | 'frames'
  | 'preferences'
  | 'tests'

/** Where the workbench reads stories from. */
export interface WorkbenchSource {
  /** Live dev server, static book, or remote embedded source. */
  readonly mode: 'dev' | 'static' | 'remote'
}

/** Current selection of the owning workbench. */
export interface WorkbenchSelection {
  /** Selected story/variant, or `null` when nothing is selected. */
  readonly target: HistoireTarget | null
}

/** Root-scoped context; surfaces receive narrower scopes extending it. */
export interface WorkbenchContext {
  /** Services the host provides in this workbench. */
  readonly capabilities: ReadonlySet<WorkbenchCapability>
  /** Story source description. */
  readonly source: WorkbenchSource
  /** SDK-backed readonly catalog. */
  readonly catalog: CatalogService
  /** Current selection snapshot. */
  readonly selection: WorkbenchSelection
  /** Tabs, panes, settings, canvas views and story navigation. */
  readonly navigation: NavigationService
  /** Present only with a compatible dev transport. */
  readonly devEvents?: DevEventService
  /** Present only where the host runs project tests (dev server). */
  readonly tests?: TestsService
  /** Notified after any context value changes; read fresh values from the context. */
  subscribe: (listener: () => void) => Disposer
}

/** Identity of one rendered story frame; two frames of one variant have distinct keys. */
export interface FrameRef {
  /** Unique frame key within the owning workbench. */
  readonly key: string
  /** Variant rendered by the frame. */
  readonly target: HistoireTarget
}

/** Readonly runtime state and settings of exactly one frame. */
export interface FrameRuntimeView {
  /** Latest coherent snapshot of the frame's session. */
  getSnapshot: () => HistoireReadonly<HistoireSnapshot>
  /** Observes future snapshots of this frame only. */
  subscribe: (listener: (snapshot: HistoireReadonly<HistoireSnapshot>) => void) => Disposer
}

/** Context bound to one frame (inspector, frame menu, frame overlays). */
export interface FrameScopedContext extends WorkbenchContext {
  /** Frame this scope is bound to; stays fixed for the scope lifetime. */
  readonly frame: FrameRef
  /** Readonly runtime state/settings of exactly this frame. */
  readonly runtime: FrameRuntimeView
}

/**
 * Context of one laid-out canvas frame, whether or not its document is live (frame header
 * badges). It has no runtime: frames outside the live budget still show their header.
 */
export interface FrameHeaderContext extends WorkbenchContext {
  /** Frame whose header is rendered. */
  readonly frame: FrameRef
}

/** Context bound to one canvas viewport (overlays, tools, custom views). */
export interface CanvasScopedContext extends WorkbenchContext {
  /** Geometry, coordinate transforms and frame leases of this canvas. */
  readonly canvas: CanvasService
}
