import type { HistoireCatalog, HistoireMatrixHint } from '@histoire/protocol'
import type { Context } from '../../context.js'
import type { ContentReader, StoryContentEntry } from '../content/types.js'

/** Allowlisted Node metadata shared by adapter projections. */
export interface CatalogStory {
  /** Exact registered story ID. */
  id: string
  /** Collected display name. */
  title: string
  /** Navigation path. */
  treePath: string[]
  /** Portable project-relative label. */
  filePath: string
  /** Framework support ID. */
  supportPluginId: string
  /** Canonical source plus executable metadata digest, without exposing private content. */
  runtimeRevision?: string
  /** Navigation group. */
  group?: string
  /** Documentation-only target. */
  docsOnly: boolean
  /** Optional finite matrix axes copied into static metadata. */
  matrix?: HistoireMatrixHint
  /** Exact variants in collected order. */
  variants: { id: string, title: string }[]
  /** Preferred docs exist. */
  docsAvailable: boolean
  /** Raw registered source exists. */
  sourceAvailable: boolean
  /** Registered source provenance. */
  sourceKind: 'file' | 'virtual' | 'unavailable'
}

/** Safe bounded collection/content issue. */
export interface CatalogDiagnostic {
  /** Stable machine category. */
  code: string
  /** Sanitized explanation. */
  message: string
  /** Related relative file label. */
  filePath?: string
  /** Exact collected story identity. */
  storyId?: string
}

/** Completed atomic metadata and private content handles. */
export interface CatalogSnapshot {
  /** Opaque project identity. */
  projectId: string
  /** Owning runtime generation. */
  epoch: string
  /** Completed source revision. */
  revision: string
  /** Internal adapter metadata. */
  stories: readonly CatalogStory[]
  /** Portable browser-safe catalog. */
  catalog: HistoireCatalog
  /** Bounded safe issues. */
  diagnostics: readonly CatalogDiagnostic[]
  /** Additional issues omitted by bounds. */
  diagnosticsTruncated: boolean
  /** All attempted collection outcomes failed. */
  failed: boolean
  /** Explicit completed collection category. */
  outcome: 'success' | 'partial' | 'failed'
  /** Frozen map facade without mutation methods. */
  contents: ReadonlyMap<string, StoryContentEntry>
  /** Complete metadata/content digest. */
  fingerprint: string
}

/** Trusted capture inputs; access and wire policies remain adapter-owned. */
export interface SnapshotOptions {
  /** Opaque project identity. */
  projectId: string
  /** Runtime generation. */
  epoch: string
  /** Credential removed from diagnostics. */
  secret?: string
  /** Optional constrained content reader for MCP. */
  readText?: ContentReader
  /** Adapter metadata acceptance policy. */
  validateStory?: (story: CatalogStory) => 'INVALID_METADATA' | 'RESULT_TOO_LARGE' | undefined
  /** Diagnostics cap supplied by adapter. */
  maxDiagnostics?: number
  /** Exact original context owning inline transform captures. */
  contentContext?: Context
}

/** Shared catalog errors are mapped by each transport at its boundary. */
export class CatalogError extends Error {
  /** Stable machine category. */
  readonly code: string
  /** Fresh generation/revision may resolve failure. */
  readonly retryable: boolean
  /** Exact target details, without private paths. */
  readonly data?: Record<string, string>
  /** Creates a transport-independent domain failure. */
  constructor(code: string, message: string, retryable = false, data?: Record<string, string>) {
    super(message)
    this.code = code
    this.retryable = retryable
    this.data = data
  }
}

/** Capture source context remains private to publication. */
export type CatalogContext = Pick<Context, 'root' | 'storyFiles'>
