/**
 * Story and variant catalog DTOs (slice 05). Type-and-constant only (plus argument
 * validators), so the parent can load it before binding its listener. Carries display
 * metadata only: no source, content, configuration objects or absolute paths.
 */
import type { TerminalOperationDefinition } from './core.js'
import { invalidArgument, rejectUnknownKeys, requireRecord, TERMINAL_BOUNDS } from './core.js'

/** Largest page of stories or variants by serialized UTF-8 bytes, below the frame bound. */
export const CATALOG_PAGE_BYTES = 160 * 1024

/** Longest story ID (matches the catalog `validId` byte bound; IDs are never shortened). */
export const CATALOG_ID_MAX = 1024

/** Longest search text. */
export const CATALOG_QUERY_MAX = 256

/** Longest retained display text (title, file label); longer values are cut with an ellipsis. */
export const CATALOG_TEXT_MAX = 200

/** Message of the failure raised when an expected revision is no longer current. */
export const CATALOG_STALE_MESSAGE = 'Catalog revision changed'

/** Router mode and base needed to build workbench routes against the parent's public origin. */
export interface CatalogWorkbenchDto {
  /** Normalized deployment base (leading and trailing slash). */
  base: string
  /** Actual UI router mode. */
  routerMode: 'hash' | 'history'
}

/** Catalog lifecycle summary; sent with every page and as the `catalog.state` event. */
export interface CatalogStateDto {
  /** Revision of the last completed catalog; absent before the first completion. */
  revision?: string
  /** A new collection is running: the revision stays readable but is about to change. */
  updating: boolean
  /** Registered stories. */
  stories: number
  /** Variants across those stories. */
  variants: number
  /** Completed collection category. */
  outcome?: 'success' | 'partial' | 'failed'
  /** Safe collection issues. */
  diagnostics: number
}

/** Story row. */
export interface CatalogStoryDto {
  /** Exact registered story ID. */
  id: string
  /** Display title (bounded). */
  title: string
  /** Project-relative file label (bounded). */
  filePath: string
  /** Documentation-only story: it has no executable variant. */
  docsOnly: boolean
  /** Variants of the story. */
  variantCount: number
  /** Several stories share this ID: no exact target can be resolved. */
  ambiguous?: true
  /** Variants matching the search text (only when searching). */
  matchedVariants?: number
}

/** Variant row. */
export interface CatalogVariantDto {
  /** Exact variant ID within its story. */
  id: string
  /** Display title (bounded). */
  title: string
  /** The ID is used by several variants of the story. */
  ambiguous?: true
  /** Variant text matches the search text (only when searching). */
  matched?: true
}

/** Arguments of `catalog.list`. */
export interface CatalogListArgs {
  /** Case-insensitive text matched against title, ID, file label and variant ID/title. */
  query?: string
  /** Opaque cursor of the previous page; absent for the first. Requires `expectedRevision`. */
  cursor?: string
  /** Refuse to continue when the catalog moved past this revision. */
  expectedRevision?: string
  /** Stories per page, 1..100 (default 100); also byte-bounded. */
  limit?: number
}

/** Result of `catalog.list`. */
export interface CatalogListPage {
  /** Revision every row of this page belongs to. */
  revision: string
  /** Lifecycle and counts of the whole catalog. */
  state: CatalogStateDto
  /** Routing facts; absent when the base is unusable (nothing can be opened). */
  workbench?: CatalogWorkbenchDto
  /** Stories matching the query across the whole catalog. */
  total: number
  /** Stories of this page. */
  stories: CatalogStoryDto[]
  /** Cursor of the next page, absent at the end. */
  next?: string
}

/** Arguments of `catalog.variants`. */
export interface CatalogVariantsArgs {
  /** Exact story ID. */
  storyId: string
  /** Marks variants matching this text. */
  query?: string
  /** Opaque cursor of the previous page. Requires `expectedRevision`. */
  cursor?: string
  /** Refuse when the catalog moved past this revision. */
  expectedRevision?: string
  /** Variants per page, 1..100 (default 100); also byte-bounded. */
  limit?: number
}

/** Result of `catalog.variants`. */
export interface CatalogVariantsPage {
  /** Revision every row of this page belongs to. */
  revision: string
  /** Exact story ID. */
  storyId: string
  /** Variants of the story. */
  total: number
  /** Variants of this page. */
  variants: CatalogVariantDto[]
  /** Cursor of the next page, absent at the end. */
  next?: string
}

/** Operation map merged into `TerminalOperations`. */
export interface CatalogOperations {
  'catalog.list': TerminalOperationDefinition<CatalogListArgs, CatalogListPage>
  'catalog.variants': TerminalOperationDefinition<CatalogVariantsArgs, CatalogVariantsPage>
}

/** Events merged into `TerminalEvents`. */
export interface CatalogEvents {
  /** Catalog revision or `updating` state changed. */
  'catalog.state': CatalogStateDto
}

/** Validates an optional string argument. */
function optionalText(value: unknown, name: string, max: number): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.length > max || !value.isWellFormed()) invalidArgument(`${name} must be a string of at most ${max} characters`)
  return value
}

/** Validates the paging fields shared by both operations. */
function pagingArgs(args: Record<string, unknown>) {
  const cursor = optionalText(args.cursor, 'cursor', TERMINAL_BOUNDS.idLength)
  const expectedRevision = optionalText(args.expectedRevision, 'expectedRevision', TERMINAL_BOUNDS.idLength * 2)
  // Continuing without the revision the cursor belongs to could silently mix revisions.
  if (cursor !== undefined && expectedRevision === undefined) invalidArgument('cursor requires expectedRevision')
  if (args.limit !== undefined && (!Number.isInteger(args.limit) || (args.limit as number) < 1 || (args.limit as number) > TERMINAL_BOUNDS.pageItems)) invalidArgument(`limit must be 1..${TERMINAL_BOUNDS.pageItems}`)
  return { query: optionalText(args.query, 'query', CATALOG_QUERY_MAX), cursor, expectedRevision, limit: args.limit as number | undefined }
}

/**
 * Validates untrusted `catalog.list` arguments.
 * @param value Detached JSON from the parent.
 */
export function parseCatalogListArgs(value: unknown): CatalogListArgs {
  const args = requireRecord(value)
  rejectUnknownKeys(args, ['query', 'cursor', 'expectedRevision', 'limit'])
  return pagingArgs(args)
}

/**
 * Validates untrusted `catalog.variants` arguments.
 * @param value Detached JSON from the parent.
 */
export function parseCatalogVariantsArgs(value: unknown): CatalogVariantsArgs {
  const args = requireRecord(value)
  rejectUnknownKeys(args, ['storyId', 'query', 'cursor', 'expectedRevision', 'limit'])
  if (typeof args.storyId !== 'string' || !args.storyId.length || args.storyId.length > CATALOG_ID_MAX || !args.storyId.isWellFormed()) invalidArgument('storyId must be a non-empty string')
  return { storyId: args.storyId, ...pagingArgs(args) }
}

/**
 * Shape check for a catalog state arriving from the child (events and replies).
 * @param value Candidate payload.
 */
export function isCatalogState(value: unknown): value is CatalogStateDto {
  if (!value || typeof value !== 'object') return false
  const state = value as Record<string, unknown>
  return typeof state.updating === 'boolean' && Number.isFinite(state.stories) && Number.isFinite(state.variants) && Number.isFinite(state.diagnostics)
    && (state.revision === undefined || typeof state.revision === 'string')
}
