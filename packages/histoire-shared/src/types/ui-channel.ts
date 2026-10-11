import type { ScreenshotSetupSnapshot } from './screenshot-setup.js'

/** Safe dev-only client identity; credentials remain server-owned. */
export interface UiMcpClientInfo {
  /** Opaque session identity. */
  id: string
  /** Client-supplied display name. */
  name: string
  /** Active transport. */
  transport: 'stdio' | 'http'
  /** UTC connection time. */
  connectedAt: string
  /** UTC last request time. */
  lastSeenAt: string
}

/** Read-only operation projection without inputs, results, or credentials. */
export interface UiMcpOperationInfo {
  /** Existing operation identity. */
  id: string
  /** Opaque client identity. */
  clientId: string
  /** Public MCP tool name. */
  tool: string
  /** Scoped canvas target, when present. */
  target?: { storyId: string, variantId?: string }
  /** Public lifecycle. */
  state: 'queued' | 'running' | 'done' | 'failed' | 'cancelled'
  /** True only while execution owner accepts cancellation for this exact handle. */
  cancellable?: boolean
  /** Known test progress, when available. */
  progress?: { done: number, total: number }
  /** UTC admission or execution time. */
  startedAt: string
  /** UTC completion time. */
  endedAt?: string
}

/** Current runtime state; restart replaces stale operation history. */
export interface UiMcpSnapshot {
  /** MCP transport availability. */
  status: 'enabled' | 'disabled' | 'unavailable'
  /** Actual bound HTTP endpoint, without credentials. */
  endpoint?: string
  /** Actual local executable and arguments; environment values never leave server. */
  stdio?: {
    /** Node executable currently running Histoire. */
    command: string
    /** Installed CLI entrypoint and explicit project/config selection. */
    args: string[]
  }
  /** Currently connected clients. */
  clients: UiMcpClientInfo[]
  /** Active operations and latest history fitting the transport byte budget. */
  operations: UiMcpOperationInfo[]
  /** Explicit telemetry omissions preserve availability without shortening identities. */
  omitted?: {
    /** Connected client rows omitted from this publication. */
    clients: number
    /** Completed calls evicted from retained history. */
    history: number
    /** Concurrent reads running without a retained activity row. */
    reads: number
    /** Oversized optional stdio configuration omitted as a whole. */
    configuration?: boolean
  }
}

/** Exact bounded capture options submitted by dev UI. */
export interface UiScreenshotRequest {
  /** Browser-generated correlation identity. */
  requestId: string
  /** One or more scoped canvas frames. */
  targets: { storyId: string, variantId: string, frameKey?: string, propsOverride?: Record<string, unknown> }[]
  /** CSS viewport dimensions. */
  viewport: { width: number, height: number }
  /** Device pixel scale. */
  scale: 1 | 2 | 3
  /** Output encoding. */
  format: 'png' | 'webp'
  /** Configured background, transparent, or checkerboard. */
  background: string
}

/** Sanitized capture failure suitable for inline display. */
export interface UiChannelError {
  /** Stable error category. */
  code: 'invalid' | 'unavailable' | 'cancelled' | 'timeout' | 'failed'
  /** Deliberate public explanation. */
  message: string
  /** One scrubbed setup diagnostic for a complete request failure. */
  setup?: ScreenshotSetupSnapshot
}

/** Successful file written beneath project screenshots directory. */
export interface UiScreenshotFile {
  /** Project-relative file location. */
  path: string
  /** Exact captured story. */
  storyId: string
  /** Exact captured variant. */
  variantId: string
  /** Exact displayed cell identity, when capture used isolated prop overrides. */
  frameKey?: string
}

/** Partial failure preserves successful captures and per-target failures. */
export type UiScreenshotResult = {
  /** Request correlation. */
  requestId: string
  /** Successfully persisted captures. */
  files: UiScreenshotFile[]
  /** Per-target failures from a partially successful request. */
  errors?: { storyId: string, variantId: string, frameKey?: string, error: UiChannelError }[]
  /** One shared setup diagnostic; never repeated in per-target error rows. */
  setup?: ScreenshotSetupSnapshot
} | {
  /** Request correlation. */
  requestId: string
  /** Admission or complete capture failure. */
  error: UiChannelError
}

/** Event maps remain open to feature-owned declaration merging. */
export interface UiClientEvents {
  /** Request current feature snapshots after reconnect. */
  'histoire:ui:ready': Record<string, never>
  /** Capture selected frames. */
  'histoire:ui:screenshot': UiScreenshotRequest
  /** Cancel this browser's capture request only. */
  'histoire:ui:screenshot-cancel': { requestId: string }
  /** List recent captures from disk. */
  'histoire:ui:screenshot-list': { requestId: string }
  /** Cancel an existing MCP operation through its owner. */
  'histoire:ui:mcp-cancel': { operationId: string }
  /** Read setup metadata or explicitly check available browser installations. */
  'histoire:ui:screenshot-setup': { requestId: string, action: 'read' | 'check' | 'refresh' }
  /** Cancel this browser's explicit setup check only. */
  'histoire:ui:screenshot-setup-cancel': { requestId: string }
}

/** Safe server notifications. */
export interface UiServerEvents {
  /** Current MCP runtime state. */
  'histoire:ui:mcp-snapshot': UiMcpSnapshot
  /** Operation lifecycle upsert. */
  'histoire:ui:mcp-operation': UiMcpOperationInfo
  /** Capture completion with partial success support. */
  'histoire:ui:screenshot-result': UiScreenshotResult
  /** Recent file inventory. */
  'histoire:ui:screenshot-list-result': { requestId: string, files: UiScreenshotFile[] }
}
  /** Correlated scrubbed setup observation or owned check error. */
  'histoire:ui:screenshot-setup-result': { requestId: string, setup: ScreenshotSetupSnapshot } | { requestId: string, error: UiChannelError }
