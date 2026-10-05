import type { HistoireCapability, HistoireCatalog, HistoireReadonly } from '@histoire/protocol'
import type { HistoireTestRunSummary } from '@histoire/shared'
import type { Connect, HttpServer } from 'vite'

/** Explicit project location; relative configuration paths resolve against root. */
export interface HistoireProjectOptions {
  /** Existing project directory, required independently of process cwd. */
  root: string
  /** Optional Histoire configuration module. */
  configFile?: string
}

/** Explicit managed HTTP binding; zero requests an actual ephemeral port. */
export interface HistoireDevOptions {
  /** Binding hostname; true permits external interfaces. */
  host?: string | boolean
  /** Requested TCP port. */
  port?: number
  /** Explicitly opens the managed book in a browser. */
  open?: boolean
}

/** Caller-owned HTTP/1 or HTTPS server and its externally visible book location. */
export interface HistoireMiddlewareOptions {
  /** Caller starts and closes this server. */
  httpServer: HttpServer
  /** Canonical absolute URL path, normalized with trailing slash. */
  base: string
  /** Explicit externally visible HTTP(S) origin. */
  publicOrigin: string
}

/** Lifecycle of one acquired hosting resource. */
export type HistoireHostingStatus = 'starting' | 'ready' | 'restarting' | 'failed' | 'closed'

/** Ready catalog and listener are distinct acquisition milestones. */
export interface HistoireServerHandle {
  /** Actual externally visible book URL. */
  readonly url: string
  /** Current hosting lifecycle. */
  readonly status: HistoireHostingStatus
  /** Resolves only after initial completed catalog publication. */
  readonly ready: Promise<void>
  /** Replaces generation while retaining this handle. */
  restart: () => Promise<void>
  /** Invalidates synchronously, then joins owned teardown. */
  close: () => Promise<void>
}

/** Stable Connect delegate; attach before listening, then await ready. */
export interface HistoireMiddlewareHandle extends HistoireServerHandle {
  /** Full original request URL is forwarded for exact matching bases. */
  readonly middleware: Connect.NextHandleFunction
}

/** Static preview validates built data before readiness, without collecting source. */
export interface HistoirePreviewHandle extends HistoireServerHandle {
  /** Legacy output stays browsable while capture is explicitly unavailable. */
  readonly capture: HistoireCapability
}

/** Fresh independent build capture with optional root-relative output override. */
export interface HistoireBuildOptions {
  /** Absolute or project-relative output root. */
  outDir?: string
}

/** Final output location and effective existing deployment target. */
export interface HistoireBuildResult {
  /** Absolute published output root. */
  outDir: string
  /** Existing configured target remains authoritative. */
  target: 'static' | 'node'
}

/** Existing test runner inputs, without CLI side effects. */
export interface HistoireRunTestsOptions {
  /** Optional exact story filter. */
  storyId?: string
  /** Exact variant filter; requires storyId. */
  variantId?: string
  /** Cancels through the project execution lane. */
  signal?: AbortSignal
}

/** Deterministic single-variant capture; viewport sizes are CSS pixels. */
export interface HistoireCaptureOptions {
  /** Exact story identity. */
  storyId: string
  /** Exact variant within story. */
  variantId: string
  /** CSS width, 320–3840; default 480. */
  width?: number
  /** CSS height, 240–2160; default 320. */
  height?: number
  /** Integer device scale, 1–3; default 1. */
  deviceScaleFactor?: number
  /** Explicit capture appearance; source default used otherwise. */
  colorScheme?: 'light' | 'dark' | 'auto'
  /** Explicit direction; source default used otherwise. */
  textDirection?: 'ltr' | 'rtl'
  /** Portable scalar globals replacing source defaults when supplied. */
  globals?: Record<string, string | number | boolean | null>
  /** Cancels through source-owned project lane. */
  signal?: AbortSignal
}

/** PNG bytes and decoded pixel dimensions; no MCP retention identity. */
export interface HistoireCaptureResult {
  /** Owned copy of PNG bytes, capped at 4 MiB. */
  png: Uint8Array
  /** Fixed image format. */
  mimeType: 'image/png'
  /** Decoded pixel width. */
  width: number
  /** Decoded pixel height. */
  height: number
  /** SHA-256 of returned bytes. */
  sha256: string
}

/** Detached public data for one independently owned source. */
export interface HistoireHostingSnapshot {
  /** Current hosting status. */
  status: HistoireHostingStatus
  /** Actual book URL, absent until acquisition. */
  url: string | null
  /** Current source lifetime, absent before acquisition. */
  epoch: string | null
  /** Last completed portable catalog. */
  catalog: HistoireCatalog | null
}

/** Stable immutable project observation, containing no context or Vite objects. */
export interface HistoireProjectSnapshot {
  /** Project lifecycle; an empty open project is idle. */
  status: 'idle' | HistoireHostingStatus
  /** One active managed or middleware development source. */
  dev: HistoireHostingSnapshot | null
  /** One independent immutable built source. */
  preview: HistoireHostingSnapshot | null
}

/** Public Node SDK; construction acquires no browser, listener or watcher. */
export interface HistoireProject {
  /** Acquires one project-owned development listener. */
  startDev: (options?: HistoireDevOptions) => Promise<HistoireServerHandle>
  /** Acquires a stable delegate without listening on the caller's server. */
  createMiddleware: (options: HistoireMiddlewareOptions) => Promise<HistoireMiddlewareHandle>
  /** Builds a fresh capture without modifying active development metadata. */
  build: (options?: HistoireBuildOptions) => Promise<HistoireBuildResult>
  /** Serves configured built output with an independent owned listener. */
  preview: (options?: Pick<HistoireDevOptions, 'host' | 'port'>) => Promise<HistoirePreviewHandle>
  /** Runs existing browser tests through shared project execution. */
  runTests: (options?: HistoireRunTestsOptions) => Promise<HistoireTestRunSummary>
  /** Captures one exact variant from ready preview or dev source. */
  captureScreenshot: (options: HistoireCaptureOptions) => Promise<HistoireCaptureResult>
  /** Returns the same snapshot until a coherent observation changes. */
  getSnapshot: () => HistoireReadonly<HistoireProjectSnapshot>
  /** Observes future changes; caller owns returned disposer. */
  subscribe: (listener: (snapshot: HistoireReadonly<HistoireProjectSnapshot>) => void) => () => void
  /** Terminal, idempotent shutdown of every owned capture and handle. */
  close: () => Promise<void>
}
