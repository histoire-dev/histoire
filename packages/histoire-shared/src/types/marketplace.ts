import type { HistoireJsonValue } from '@histoire/protocol'
import type { accessKinds, addKinds, categories, packageManagers, tints } from '../marketplace/enums.js'

/** npm package name, including its scope. */
export type PluginId = string
/** Primary marketplace category. */
export type Category = typeof categories[number]
/** Fallback tile palette. */
export type Tint = typeof tints[number]
/** Declarative contribution category. */
export type AddKind = typeof addKinds[number]
/** Declared plugin access, not a runtime permission grant. */
export type Access = typeof accessKinds[number]
/** Contribution advertised by a manifest. */
export interface Add {
  /** Contribution category. */ kind: AddKind
  /** Short description. */ text: string
  /** Plugin-local id of the registration this entry describes. */ contribution?: string
}
/** One enumerated option choice. */
export interface MarketplaceChoice {
  /** Serialized option value. */ value: string
  /** Visible choice name. */ label: string
}
/** Common declarative option fields. */
export interface MarketplaceOptionBase {
  /** Safe dot path in the factory's first argument. */ key: string
  /** Visible field name. */ label: string
  /** Optional field guidance. */ description?: string
  /** Show when each referenced option equals this literal value. */ when?: Record<string, HistoireJsonValue>
}
/** Typed defaults prevent forms from emitting values the plugin cannot consume. */
export type MarketplaceOption = MarketplaceOptionBase & (
  | { /** Boolean control. */ type: 'boolean', /** Omitted value. */ default?: boolean }
  | { /** Text control. */ type: 'string', /** Omitted value. */ default?: string }
  | { /** Text list control. */ type: 'string-list', /** Omitted value. */ default?: string[] }
  | { /** Choice control. */ type: 'enum', /** Control presentation. */ display?: 'select' | 'segmented', /** Allowed values. */ choices: MarketplaceChoice[], /** Omitted value. */ default?: string }
)
/** Version-scoped release note. */
export interface ReleaseNote {
  /** Release impact. */ kind: 'breaking' | 'feature' | 'fix'
  /** Plain text description. */ text: string
  /** Related option paths or code fragments, never executed. */ code?: string[]
}
/** Declarative edits to literal plugin options only. */
export type MigrationOp =
  | { /** Rename a property. */ op: 'rename-option', /** Original path. */ from: string, /** Replacement path. */ to: string }
  | { /** Remove a property. */ op: 'remove-option', /** Property path. */ path: string }
  | { /** Set a literal property. */ op: 'set-option', /** Property path. */ path: string, /** New JSON value. */ value: HistoireJsonValue }
/** Migration selected by the installed version. */
export interface MarketplaceMigration {
  /** Installed version range. */ from: string
  /** Ordered declarative edits. */ ops: MigrationOp[]
}
/** Project signal used by Discover, never evaluated as code. */
export type MarketplaceRecommendation = (
  | { /** Dependency to detect. */ dependency: string }
  | { /** Recommend when this plugin is missing. */ missing: true }
) & { /** Reason shown beside recommendation. */ reason: string }
/** Validated package.json#histoire.marketplace content. */
export interface MarketplaceManifest {
  /** Name, at most 40 characters. */ displayName: string
  /** Summary, at most 160 characters. */ summary: string
  /** Primary category. */ category: Category
  /** Empty or omitted means any framework. */ frameworks?: string[]
  /** Package peer requirements. */ requires?: Record<string, string>
  /** Fallback tile letters. */ monogram: string
  /** Fallback tile color. */ tint: Tint
  /** Optional HTTPS logo. */ logoUrl?: string
  /** Declared contributions. */ adds?: Add[]
  /** Declared access. */ access?: Access[]
  /** Declarative factory call. */ config: {
    /** Named export from the package root. */ import: string
    /** Ordered fields; emit only non-default values. */ options?: MarketplaceOption[]
  }
  /** Discover recommendations. */ recommend?: MarketplaceRecommendation[]
  /** Curated collection identifiers. */ collections?: string[]
  /** Notes for this package version. */ releaseNotes?: ReleaseNote[]
  /** Literal option migrations. */ migrations?: MarketplaceMigration[]
}
/** Browser-local preferences, sent with every read or plan. */
export interface MarketplacePrefs {
  /** Enable registry reads for community plugins. */ community: boolean
  /** Package manager override. */ packageManager: typeof packageManagers[number]
  /** Restart policy after configuration changes. */ afterInstall: 'restart' | 'ask'
  /** Per-plugin update dismissal. */ skippedVersions: Record<PluginId, string>
}
/** Public searchable catalog row. */
export interface CatalogEntry {
  /** npm identity. */ id: PluginId
  /** Visible name. */ displayName: string
  /** Short description. */ summary: string
  /** Publisher identity. */ publisher: string
  /** Bundled entry AND @histoire scope. */ official: boolean
  /** Primary category. */ category: Category
  /** Supported frameworks; empty means any. */ frameworks: string[]
  /** Declared contributions. */ adds: Add[]
  /** Tile letters. */ monogram: string
  /** Tile color. */ tint: Tint
  /** Optional HTTPS logo. */ logoUrl?: string
  /** Latest version. */ latest: string
  /** Registry update timestamp. */ updatedAt?: string
  /** License identifier. */ license?: string
  /** Source repository link. */ repoUrl?: string
  /** Documentation link. */ docsUrl?: string
  /** Joined installed state. */ installed?: {
    /** Actual installed version or local. */ version: string
    /** Included in active config. */ enabled: boolean
    /** Framework support or built-in. */ required: boolean
    /** Compatible newer version. */ update?: string
  }
  /** Project compatibility. */ compatible: {
    /** All requirements match. */ ok: boolean
    /** Incompatibility explanation. */ reason?: string
  }
  /** Search relevance. */ score?: number
  /** Inclusive character ranges to highlight. */ match?: Array<{
    /** Matched field. */ field: 'displayName' | 'summary' | 'id'
    /** Inclusive start and end offsets. */ ranges: Array<[number, number]>
  }>
}
/** Catalog query and portable preferences. */
export interface CatalogQuery {
  /** Selected marketplace tab. */ view: 'all' | 'discover'
  /** Search text. */ query?: string
  /** Active facets. */ filters?: {
    /** Primary category. */ category?: Category
    /** Framework facets. */ frameworks?: string[]
    /** Restrict to bundled official entries. */ officialOnly?: boolean
    /** Contribution facets. */ adds?: AddKind[]
    /** Curated collection identity from the manifest `collections` list. */ collection?: string
  }
  /** Result order. */ sort?: 'relevance' | 'name' | 'updated'
  /** Browser preferences. */ prefs: MarketplacePrefs
  /** Opaque next-page position. */ cursor?: string
  /** Maximum page size, at most 60. */ limit?: number
}
/** One catalog result page. */
export interface CatalogPage {
  /** Matching rows. */ entries: CatalogEntry[]
  /** Total matching rows. */ total: number
  /** Next-page position. */ cursor?: string
  /** Facet counts. */ facets: {
    /** Per category. */ category: Record<Category, number>
    /** Per framework. */ frameworks: Record<string, number>
    /** Official entries. */ official: number
    /** Per contribution kind. */ adds: Record<AddKind, number>
  }
  /** Detected project context. */ project: {
    /** Framework names. */ frameworks: string[]
    /** Detected dependency signals. */ signals: string[]
  }
  /** Source health. */ sources: {
    /** Bundled index is always available. */ official: 'ok'
    /** Registry state. */ community: 'off' | 'ok' | 'stale' | 'error'
  }
  /** Optional curated discovery content. */ discover?: {
    /** Featured recommendation. */ hero?: CatalogEntry & { /** Project reason. */ reason: string }
    /** Recommended entries. */ picks: Array<CatalogEntry & { /** Project reason. */ reason: string }>
    /** Curated groups. */ collections: Array<{
      /** Collection identity. */ id: string
      /** Visible heading. */ title: string
      /** Group entries. */ entries: CatalogEntry[]
    }>
  }
}
/** Detail data, without executing package code. */
export interface PluginDetail extends CatalogEntry {
  /** Validated manifest. */ manifest: MarketplaceManifest
  /** Published versions. */ versions: Array<{
    /** Version string. */ version: string
    /** Publish timestamp. */ date?: string
    /** Registry deprecation flag. */ deprecated?: boolean
    /** Project compatibility. */ compatible: boolean
    /** Short reason when incompatible, e.g. "Needs vite 7". */ reason?: string
  }>
  /** Registry carries an attestation; does not imply verification. */ provenance: boolean
  /** Package requirements. */ requires: Record<string, string>
  /** Declared access. */ access: Access[]
  /** Current release notes. */ releaseNotes?: ReleaseNote[]
}
/** User intent before planning. */
export interface ChangeRequest {
  /** Change operation. */ kind: 'install' | 'remove' | 'update' | 'pin' | 'options'
  /** npm identity. */ id: PluginId
  /** Target version. */ version?: string
  /** Literal option values by dot path. */ options?: Record<string, HistoireJsonValue>
  /** Apply declarative migrations. */ migrate?: boolean
  /** Browser preferences. */ prefs: MarketplacePrefs
}
/** One bounded unified diff line. */
export interface DiffLine {
  /** Line operation. */ kind: 'context' | 'add' | 'del'
  /** Line content. */ text: string
}
/** A manual action with optional copyable code. */
export interface ManualStep {
  /** Action label. */ title: string
  /** Command or config snippet, never executed by the browser. */ code?: string
}
/** Generation-scoped, reviewable project change. */
export interface ChangePlan {
  /** Generation-local identity. */ planId: string
  /** SHA256 of argv, diffs and config hash. */ hash: string
  /** Selected command tool. */ packageManager: {
    /** Tool name. */ name: Exclude<typeof packageManagers[number], 'auto'>
    /** Selection evidence. */ source: 'lockfile' | 'packageManager' | 'override'
  }
  /** Optional command; run as argv without a shell. */ command?: {
    /** Executable and arguments. */ argv: string[]
    /** Copyable command. */ display: string
  }
  /** Project file changes. */ files: Array<{
    /** Project-relative path. */ path: string
    /** Added line count. */ added: number
    /** Removed line count. */ removed: number
    /** Diff with up to three context lines per hunk. */ lines: DiffLine[]
  }>
  /** Review warnings. */ warnings: string[]
  /** Manual fallback. */ manual?: {
    /** Why automation is unavailable. */ reason: 'static' | 'config-not-literal' | 'no-package-manager' | 'migration-manual' | 'workspace-unsupported'
    /** Ordered user actions. */ steps: ManualStep[]
  }
}
/** Ordered install lifecycle. */
export type JobStepId = 'resolve' | 'install' | 'config' | 'restart' | 'load'
/** Portable job snapshot, retained across server restarts. */
export interface JobState {
  /** Server-owned identity. */ jobId: string
  /** Requested operation. */ kind: ChangeRequest['kind']
  /** npm identity. */ id: PluginId
  /** Target version. */ version: string
  /** Ordered steps. */ steps: Array<{
    /** Step identity. */ id: JobStepId
    /** Step lifecycle. */ state: 'pending' | 'running' | 'done' | 'failed' | 'skipped'
    /** Elapsed milliseconds. */ ms?: number
  }>
  /** Overall lifecycle. */ status: 'running' | 'succeeded' | 'failed' | 'cancelled'
  /**
   * Running job paused on the user: `continue` before the first restart trigger when `afterInstall`
   * is `ask` (send `job-continue`; the server then asks the dev proxy for a new process), `restart`
   * when no dev proxy can replace the process and the user must restart the dev server.
   */
  awaiting?: 'continue' | 'restart'
  /** Sanitized output, at most 400 lines and 64 KiB per event. */ output: string[]
  /** Recoverable failure information. */ failure?: {
    /** Failure category. */ code: 'peer-conflict' | 'not-found' | 'network' | 'config-write' | 'load' | 'unknown'
    /** Visible explanation. */ message: string
    /** Project files restored byte-for-byte. */ restored: boolean
    /** Unrestored effects, including node_modules. */ leftovers: string[]
    /** Compatible alternative. */ suggestion?: { /** Alternative version. */ version: string, /** Suggestion reason. */ reason: string }
  }
  /** Contributions observed after load, not manifest promises. */ contributions?: Array<{
    /** Contribution category. */ kind: AddKind
    /** Extension-host identity. */ id: string
    /** Visible label. */ label: string
  }>
}
