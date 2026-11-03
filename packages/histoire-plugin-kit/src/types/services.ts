import type { HistoireCatalogStory, HistoireJsonValue, HistoireReadonly, HistoireRect, HistoireSearchResult, HistoireSelectionInput, HistoireTarget, HistoireTestRunSummary } from '@histoire/protocol'
import type { Disposer } from './common.js'
import type { FrameRef } from './context.js'

/** Metadata-only catalog access, mirroring `HistoireSession.catalog`. */
export interface CatalogService {
  /** Reads the completed source catalog. */
  list: () => Promise<readonly HistoireCatalogStory[]>
  /** Resolves one exact story. */
  getStory: (storyId: string) => Promise<HistoireCatalogStory>
  /** Searches titles and docs without mounting stories. */
  search: (query: string) => Promise<readonly HistoireSearchResult[]>
}

/**
 * Workbench navigation. Ids are qualified plugin ids (`acme:panel`) or `builtin:` ids.
 * Unknown ids are ignored with a diagnostic once the host is ready.
 */
export interface NavigationService {
  /** Selects a story or variant. */
  selectStory: (input: HistoireSelectionInput) => Promise<void>
  /** Opens an inspector tab. */
  openInspectorTab: (tabId: string) => void
  /** Opens a rail pane. */
  openPane: (paneId: string) => void
  /** Opens settings, optionally at one section. */
  openSettings: (sectionId?: string) => void
  /** Switches the canvas arrangement to a built-in or plugin view. */
  openCanvasView: (viewId: string) => void
}

/** Plugin events forwarded to the Node `onDevEvent` hook over the dev transport. */
export interface DevEventService {
  /** Sends one event and resolves with the Node hook's result. */
  send: (event: string, payload?: HistoireJsonValue) => Promise<unknown>
}

/** Latest test facts of one variant. */
export interface TestsEntry {
  /** Variant the facts belong to. */
  readonly target: HistoireTarget
  /** Latest completed run of the variant, `null` before its first run. */
  readonly summary: HistoireReadonly<HistoireTestRunSummary> | null
  /** A run including this variant is in progress. */
  readonly running: boolean
  /** Sources changed since the summary was produced. */
  readonly stale: boolean
  /** Message of a failure that kept the variant from reporting, `null` otherwise. */
  readonly error: string | null
}

/**
 * Project test runs shared with the workbench Tests pane (same results, same execution lane).
 * Present only where the host can run tests (dev server).
 */
export interface TestsService {
  /** Variants that reported or are running, in no particular order. */
  entries: () => ReadonlyArray<TestsEntry>
  /** A run is in progress. */
  readonly running: boolean
  /** Runs can start now (server tests available, source ready). */
  readonly canRun: boolean
  /**
   * Progress of the current run; `null` when idle or unknown. Server runs wait to start (`queued`,
   * for example behind other test work), collect stories (`collect`, counted in stories), then run
   * assertions (`run`, counted in variants).
   */
  readonly progress: { readonly phase: 'queued' | 'collect' | 'run', readonly completed: number, readonly total: number } | null
  /** Failure of the latest run as a whole (not of single tests), `null` otherwise. */
  readonly error: string | null
  /** Runs every selectable variant, like the Tests pane "Run all". */
  runAll: () => Promise<void>
  /** Runs one variant. */
  run: (target: HistoireTarget) => Promise<void>
  /** Notified after entries or run state change; read fresh values from the service. */
  subscribe: (listener: () => void) => Disposer
}

/** Point in CSS pixels. */
export interface CanvasPoint {
  /** Horizontal position. */
  x: number
  /** Vertical position. */
  y: number
}

/** Geometry of one frame laid out on the canvas. */
export interface CanvasFrameGeometry {
  /** Frame identity. */
  readonly frame: FrameRef
  /** Frame document box: position in canvas space, size in the document's CSS pixels. */
  readonly rect: HistoireRect
}

/** Why a frame lease was refused or ended before readiness. */
export type FrameLeaseFailureReason =
  /** Every live frame slot of the viewport is taken; the selected frame keeps the last one. */
  | 'budget'
  /** Released (or its signal aborted) before it was granted or became ready. */
  | 'released'
  /** The canvas viewport went away. */
  | 'unavailable'

/** Rejection value of `acquireFrame` and of `FrameLease.ready` after release. */
export interface FrameLeaseError extends Error {
  /** Always `FrameLeaseError`. */
  readonly name: 'FrameLeaseError'
  /** Failure category. */
  readonly reason: FrameLeaseFailureReason
}

/** Managed story frame acquired through the canvas frame budget. */
export interface FrameLease {
  /** Frame identity, registered in the workbench frame registry; distinct per lease. */
  readonly frame: FrameRef
  /**
   * Resolves once the frame rendered its variant. Rejects with the startup error, or with a
   * `FrameLeaseError` (`released`) when released first.
   */
  readonly ready: Promise<void>
  /** Releases the frame and disposes its session exactly once; cancels pending startup. Idempotent. */
  release: () => void
}

/** Options for acquiring a managed frame. */
export interface FrameLeaseOptions {
  /** Element receiving the frame document; the plugin owns its placement and size. */
  container: HTMLElement
  /**
   * Logical box registered for coordinate conversion, frame overlays and `frames()`: position
   * in canvas space, size in the frame document's CSS pixels. Defaults to the container's
   * size at the canvas origin.
   */
  rect?: HistoireRect
  /** Wait for a free slot instead of rejecting with `budget` when the viewport budget is full. */
  queue?: boolean
  /** Aborting releases the lease, or withdraws a queued request. */
  signal?: AbortSignal
}

/**
 * Readonly geometry, coordinate transforms and frame leases of one canvas viewport.
 * Getters read live values; subscribe to re-read after changes.
 */
export interface CanvasService {
  /** Effective zoom factor. */
  readonly zoom: number
  /** Canvas translation in viewport pixels. */
  readonly pan: Readonly<CanvasPoint>
  /** Viewport box in client coordinates. */
  readonly viewport: Readonly<HistoireRect>
  /** Converts a viewport-local point to canvas space. */
  toCanvas: (point: CanvasPoint) => CanvasPoint
  /** Converts a canvas-space point to viewport-local coordinates. */
  toViewport: (point: CanvasPoint) => CanvasPoint
  /**
   * Converts a point in one frame document's CSS pixels to viewport-local coordinates using
   * the frame's rendered box, so it follows pan, zoom, scroll and rotation. `null` while the
   * frame has no rendered document.
   */
  frameToViewport: (frameKey: string, point: CanvasPoint) => CanvasPoint | null
  /**
   * Converts a viewport-local point to the exact frame document's CSS pixels. Returns `null`
   * while the frame has no rendered document. Coordinates follow the rendered frame box.
   * Older or external hosts may omit this capability.
   */
  viewportToFrame?: (frameKey: string, point: CanvasPoint) => CanvasPoint | null
  /** Frames currently registered on this canvas, including leased ones. */
  frames: () => ReadonlyArray<CanvasFrameGeometry>
  /**
   * Acquires a managed frame through the viewport budget and startup queue. Rejects with a
   * `FrameLeaseError` (`budget`) when denied and `queue` is not set.
   */
  acquireFrame: (target: HistoireTarget, options: FrameLeaseOptions) => Promise<FrameLease>
  /** Notified after geometry or frame list changes. */
  subscribe: (listener: () => void) => Disposer
}
