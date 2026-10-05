import type { HistoireMatrixHint } from '../helpers/matrix.js'
import type { HistoireCapabilities, HistoireTarget } from './common.js'
import type { HistoireEmbedPolicy, HistoireSourceAssets, HistoireSourceConfig } from './source-descriptor.js'

/** Projected collection issue without internal stack/path/context. */
export interface HistoireDiagnostic {
  /** Stable diagnostic kind. */
  code: string
  /** User-facing collection detail. */
  message: string
  /** Related collected story when known. */
  storyId?: string
  /** Portable relative file label. */
  relativePath?: string
  /** Diagnostic severity. */
  severity: 'warning' | 'error'
}

/** Portable variant metadata; no slots/components/callbacks. */
export interface HistoireCatalogVariant {
  /** Exact variant identity scoped to story. */
  id: string
  /** Display title. */
  title: string
  /** Optional projected icon. */
  icon?: string
  /** Whether collection observed tests. */
  hasTests?: boolean
  /** Available content modes. */
  source?: { raw: boolean, dynamic: boolean }
}

/** Portable story metadata used by every source projection. */
export interface HistoireCatalogStory {
  /** Exact collected ID. */
  id: string
  /** Display title. */
  title: string
  /** Nested group/folder path. */
  path: readonly string[]
  /** Group identifier. */
  group?: string
  /** Optional icon name. */
  icon?: string
  /** Optional icon color. */
  iconColor?: string
  /** Standalone documentation story. */
  docsOnly: boolean
  /** Preview layout advertised by source. */
  layout?: { type: 'single' | 'grid', iframe?: boolean }
  /** Finite prop domains for two-axis preview matrices. */
  matrix?: HistoireMatrixHint
  /** Support plugin identity without loader. */
  supportPluginId?: string
  /** SHA-256 of canonical story source and executable metadata; absent means conservative reload. */
  runtimeRevision?: string
  /** Relative project file label. */
  relativePath?: string
  /** Collected variants in selection order. */
  variants: readonly HistoireCatalogVariant[]
  /** Available static documentation and source. */
  content: { docs: boolean, rawSource: boolean }
}

/** Stable tree nodes name stories, never catalog array offsets. */
export type HistoireCatalogTreeNode = { kind: 'story', title: string, storyId: string } | { kind: 'folder' | 'group', title: string, id?: string, children: readonly HistoireCatalogTreeNode[] }

/** Immutable completed catalog projection. */
export interface HistoireCatalog {
  /** Stories in source order; duplicate IDs diagnosed by source. */
  stories: readonly HistoireCatalogStory[]
  /** Navigation tree using exact IDs. */
  tree: readonly HistoireCatalogTreeNode[]
  /** Completed collection issues. */
  diagnostics: readonly HistoireDiagnostic[]
}

/** Ranked target from title or documentation search. */
export interface HistoireSearchResult {
  /** Exact activation target. */
  target: HistoireTarget
  /** Search source. */
  kind: 'story' | 'variant' | 'docs'
  /** Display label. */
  title: string
  /** Existing source ranking. */
  rank: number
  /** Optional plain text excerpt. */
  excerpt?: string
  /** Panel-local documentation anchor. */
  anchor?: string
}

/** Versioned source descriptor, with heavy content kept out of catalog. */
export interface HistoireSourceDescriptor {
  /** Descriptor schema version. */
  descriptorVersion: 1
  /** Supported bridge protocol version. */
  protocolVersion: 1
  /** Stable book identity. */
  sourceId: string
  /** Current source generation. */
  epoch: string
  /** Completed source publication. */
  revision: string
  /** Available source engine. */
  mode: 'dev' | 'static'
  /** Portable catalog projection. */
  catalog: HistoireCatalog
  /** Source-supported engines and surfaces. */
  capabilities: HistoireCapabilities
  /** Portable source appearance populated by first-party dev/static adapters. */
  config?: HistoireSourceConfig
  /** Exact document parent-origin policy. */
  embed?: HistoireEmbedPolicy
  /** Lazy same-book content/search inventory. */
  assets?: HistoireSourceAssets
}
